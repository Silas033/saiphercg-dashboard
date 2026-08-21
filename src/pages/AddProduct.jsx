// src/pages/AddProduct.jsx
// Fully wired to Supabase. On "Save + Publish":
//   1. Inserts a row into products
//   2. Inserts rows into product_variants
//   3. Uploads image files to Supabase Storage bucket "product-images"
//      and inserts rows into product_images
//
// Field → DB column mapping:
//   Product Images      → product_images table
//   Video / YT link     → products.video
//   Product Name        → products.name
//   Product Code        → products.id  (auto-generated if blank)
//   Category            → products.category_key
//   Description         → products.description
//   Sale Unit           → products.sale_unit
//   Variation Set Label → products.variant_label
//   Hide Price          → products.hide_price
//   Variation rows      → product_variants table

import { useEffect, useRef, useState } from "react";
import {
    FaArrowUp, FaCheckCircle, FaCloudUploadAlt,
    FaSearch, FaTrashAlt, FaTimes,
    FaVideo, FaYoutube, FaExclamationTriangle,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import "../styles/addproduct.css";

const ACCEPTED_TYPES     = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES        = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_SIZE     = 50 * 1024 * 1024;
const MAX_VIDEO_DURATION = 60;

function getCategoryPrefix(category) {
    const source = String(category?.label || category?.key || "Product")
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1 $2");

    const words = source
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean);

    if (words.length >= 2) {
        return words
            .map(word => word[0])
            .join("")
            .slice(0, 4)
            .toUpperCase();
    }

    return (words[0] || "PRD")
        .slice(0, 3)
        .toUpperCase();
}

function getProductNameToken(name) {
    const compact = String(name || "")
        .replace(/[^a-zA-Z0-9]+/g, "")
        .toUpperCase();

    return compact.slice(0, 5) || "ITEM";
}

function createIdSeed() {
    const timePart = Date.now().toString(36).slice(-4);
    const randomPart = Math.random().toString(36).slice(2, 5);
    return `${timePart}${randomPart}`.toUpperCase();
}

function generateProductId(category, name, seed) {
    return `${getCategoryPrefix(category)}-${getProductNameToken(name)}-${seed}`;
}

function generateVariantId(productId, index) {
    return `${productId}-v${index + 1}`;
}

function buildVariantIdPreviews(productId, variations) {
    const usedIds = new Set(
        variations
            .map(variation => variation.sku.trim())
            .filter(Boolean)
    );

    let nextNumber = 1;

    return variations.map(variation => {
        if (variation.sku.trim()) return variation.sku.trim();

        let candidate = generateVariantId(productId, nextNumber - 1);

        while (usedIds.has(candidate)) {
            nextNumber += 1;
            candidate = generateVariantId(productId, nextNumber - 1);
        }

        usedIds.add(candidate);
        nextNumber += 1;
        return candidate;
    });
}

async function recordIdExists(tableName, id) {
    const { data, error } = await supabase
        .from(tableName)
        .select("id")
        .eq("id", id)
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);
    return Boolean(data);
}

async function getUniqueProductId(baseId) {
    let candidate = baseId;
    let suffix = 2;

    while (await recordIdExists("products", candidate)) {
        candidate = `${baseId}-${suffix}`;
        suffix += 1;
    }

    return candidate;
}

function parseYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    ];
    for (const p of patterns) { const m = url.match(p); if (m?.[1]) return m[1]; }
    return null;
}

export default function AddProduct({ onCancel, onSaved }) {
    // Form fields
    const [productName,        setProductName]        = useState("");
    const [productCode,        setProductCode]        = useState("");
    const [description,        setDescription]        = useState("");
    const [saleUnit,           setSaleUnit]           = useState("");
    const [variationSetLabel,  setVariationSetLabel]  = useState("");
    const [hidePrice,          setHidePrice]          = useState(false);
    const [variations,         setVariations]         = useState([]);

    // Media
    const [images,            setImages]            = useState([]);
    const [zoneActive,        setZoneActive]        = useState(false);
    const [dragOverIndex,     setDragOverIndex]     = useState(null);
    const [videoState,        setVideoState]        = useState({ status: "idle", url: "", name: "", duration: 0, error: "" });
    const [videoProgress,     setVideoProgress]     = useState(0);
    const [videoMode,         setVideoMode]         = useState("file");
    const [youtubeInput,      setYoutubeInput]      = useState("");
    const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
    const [videoZoneActive,   setVideoZoneActive]   = useState(false);

    // Category
    const [categories,         setCategories]         = useState([]);
    const [selectedCategory,   setSelectedCategory]   = useState(null);
    const [categoryOpen,       setCategoryOpen]       = useState(false);
    const [categorySearch,     setCategorySearch]     = useState("");
    const [customCategoryMode, setCustomCategoryMode] = useState(false);
    const [customCategoryInput,setCustomCategoryInput]= useState("");

    // UI
    const [toast,     setToast]     = useState("");
    const [saving,    setSaving]    = useState(false);
    const [saveError, setSaveError] = useState("");

    // Refs
    const inputRef            = useRef(null);
    const videoInputRef       = useRef(null);
    const categoryDropdownRef = useRef(null);
    const dragItemIndex       = useRef(null);
    const objectUrlsRef       = useRef([]);
    const videoUrlRef         = useRef(null);
    const videoProgressRef    = useRef(null);
    const idSeedRef           = useRef(createIdSeed());

    // Load categories
    useEffect(() => {
        supabase.from("categories").select("key, label").order("sort_order")
            .then(({ data, error }) => { if (!error && data) setCategories(data); });
    }, []);

    useEffect(() => () => {
        objectUrlsRef.current.forEach(URL.revokeObjectURL);
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        if (videoProgressRef.current) clearInterval(videoProgressRef.current);
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(""), 2400);
        return () => clearTimeout(t);
    }, [toast]);

    useEffect(() => {
        const handler = (e) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
                setCategoryOpen(false); setCustomCategoryMode(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ── Images ────────────────────────────────────────────────
    const handleFiles = (fileList) => {
        const valid = Array.from(fileList).filter(f => ACCEPTED_TYPES.includes(f.type));
        if (!valid.length) return;
        const loaded = valid.map((file, i) => {
            const src = URL.createObjectURL(file);
            objectUrlsRef.current.push(src);
            return { id: `${file.name}-${Date.now()}-${i}`, name: file.name, src, file };
        });
        setImages(prev => [...prev, ...loaded]);
        setToast(`${valid.length} image${valid.length > 1 ? "s" : ""} added`);
        setZoneActive(false);
    };
    const handleFileInput  = (e) => { handleFiles(e.target.files); e.target.value = ""; };
    const handleDrop       = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); setZoneActive(false); };
    const handleDragOver   = (e) => { e.preventDefault(); setZoneActive(true); };
    const handleDragLeave  = () => setZoneActive(false);
    const removeImage      = (i) => setImages(prev => prev.filter((_, idx) => idx !== i));
    const moveToCover      = (i) => {
        if (i === 0) return;
        setImages(prev => { const n = [...prev]; const [item] = n.splice(i, 1); n.unshift(item); return n; });
    };
    const onDragStart  = (i) => (e) => { dragItemIndex.current = i; e.dataTransfer.effectAllowed = "move"; };
    const onDragEnter  = (i) => setDragOverIndex(i);
    const onDragEnd    = () => { dragItemIndex.current = null; setDragOverIndex(null); };
    const onDropOnCard = (i) => {
        const src = dragItemIndex.current;
        if (src === null || src === i) { onDragEnd(); return; }
        setImages(prev => { const n = [...prev]; const [m] = n.splice(src, 1); n.splice(i, 0, m); return n; });
        onDragEnd();
    };

    // ── Video ─────────────────────────────────────────────────
    const cleanupVideoUrl = () => { if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; } };

    const startVideoProgress = () => {
        setVideoProgress(8);
        if (videoProgressRef.current) clearInterval(videoProgressRef.current);
        videoProgressRef.current = setInterval(() => {
            setVideoProgress(c => { if (c >= 90) { clearInterval(videoProgressRef.current); return 90; } return c + 8; });
        }, 120);
    };
    const stopVideoProgress = () => {
        if (videoProgressRef.current) { clearInterval(videoProgressRef.current); videoProgressRef.current = null; }
        setVideoProgress(100);
    };

    const handleVideoSelection = (fileList) => {
        const file = Array.from(fileList)[0];
        if (!file) return;
        if (!VIDEO_TYPES.includes(file.type)) {
            setVideoState({ status: "error", url: "", name: "", duration: 0, error: "Only MP4, WebM, or MOV files are allowed." }); return;
        }
        if (file.size > MAX_VIDEO_SIZE) {
            setVideoState({ status: "error", url: "", name: "", duration: 0, error: "Video must be 50 MB or smaller." }); return;
        }
        cleanupVideoUrl();
        const url = URL.createObjectURL(file);
        videoUrlRef.current = url;
        setVideoState({ status: "processing", url, name: file.name, duration: 0, error: "", file });
        startVideoProgress();
        const meta = document.createElement("video");
        meta.preload = "metadata"; meta.src = url;
        meta.onloadedmetadata = () => {
            if (meta.duration > MAX_VIDEO_DURATION) {
                cleanupVideoUrl();
                setVideoState({ status: "error", url: "", name: "", duration: 0, error: "Video must be 60 seconds or shorter." });
                stopVideoProgress(); setVideoProgress(0); return;
            }
            stopVideoProgress();
            setVideoState({ status: "ready", url, name: file.name, duration: meta.duration, error: "", file });
        };
        meta.onerror = () => {
            cleanupVideoUrl();
            setVideoState({ status: "error", url: "", name: "", duration: 0, error: "Could not load this video." });
            stopVideoProgress(); setVideoProgress(0);
        };
    };
    const handleVideoInput = (e) => { handleVideoSelection(e.target.files); e.target.value = ""; };

    const attachYoutube = () => {
        const id = parseYouTubeId(youtubeInput.trim());
        if (!id) { setVideoState({ status: "error", url: "", name: "", duration: 0, error: "Invalid YouTube URL." }); return; }
        cleanupVideoUrl();
        const embedUrl = `https://www.youtube.com/embed/${id}`;
        setVideoState({ status: "ready", url: embedUrl, name: `YouTube Video (${id})`, duration: 0, error: "", type: "youtube" });
        setYoutubeInput("");
        setVideoLightboxOpen(true);
    };

    // ── Category ──────────────────────────────────────────────
    const filteredCategories = categories.filter(c =>
        c.label.toLowerCase().includes(categorySearch.toLowerCase())
    );
    const normalizedSearch = categorySearch.trim();
    const exactMatch = categories.some(c => c.label.toLowerCase() === normalizedSearch.toLowerCase());
    const canCreate  = normalizedSearch.length > 0 && !exactMatch;

    const generatedProductIdPreview = generateProductId(
        selectedCategory,
        productName,
        idSeedRef.current
    );
    const effectiveProductIdPreview = productCode.trim() || generatedProductIdPreview;
    const variationIdPreviews = buildVariantIdPreviews(
        effectiveProductIdPreview,
        variations
    );

    const selectCategory = (cat) => { setSelectedCategory(cat); setCategoryOpen(false); setCategorySearch(""); setCustomCategoryMode(false); };

    const createCategory = async (labelName) => {
        const trimmed = labelName.trim();
        if (!trimmed) return;
        const existing = categories.find(c => c.label.toLowerCase() === trimmed.toLowerCase());
        if (existing) { selectCategory(existing); return; }
        const key = trimmed.replace(/[^a-zA-Z0-9]+/g, "");
        const { data, error } = await supabase.from("categories")
            .insert({ key, label: trimmed, sort_order: categories.length }).select().single();
        if (!error && data) { setCategories(prev => [...prev, data]); selectCategory(data); }
        setCategorySearch(""); setCustomCategoryMode(false); setCustomCategoryInput("");
    };

    // ── Variations ────────────────────────────────────────────
    const addVariation    = () => setVariations(prev => [...prev, { rowId: `var-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, sku: "", label: "", price: "" }]);
    const updateVariation = (rowId, field, value) => setVariations(prev => prev.map(v => v.rowId !== rowId ? v : { ...v, [field]: value }));
    const removeVariation = (rowId) => setVariations(prev => prev.filter(v => v.rowId !== rowId));

    // ── Save ──────────────────────────────────────────────────
    const handleSave = async () => {
        if (!productName.trim()) { setSaveError("Product name is required."); return; }
        if (!selectedCategory)   { setSaveError("Please select a category."); return; }
        setSaving(true); setSaveError("");
        try {
            const customProductId = productCode.trim();
            let productId;

            if (customProductId) {
                if (await recordIdExists("products", customProductId)) {
                    throw new Error(`Product ID "${customProductId}" already exists.`);
                }
                productId = customProductId;
            } else {
                productId = await getUniqueProductId(generatedProductIdPreview);
            }

            const finalVariantIds = buildVariantIdPreviews(productId, variations);
            const variantRows = variations.map((v, i) => ({
                id:         v.sku.trim() || finalVariantIds[i],
                product_id: productId,
                label:      v.label.trim(),
                price:      parseFloat(v.price) || 0,
                sort_order: i,
            }));

            const variantIds = variantRows.map(row => row.id);
            if (new Set(variantIds).size !== variantIds.length) {
                throw new Error("Variation IDs must be unique.");
            }

            if (variantIds.length > 0) {
                const { data: existingVariants, error: variantCheckError } = await supabase
                    .from("product_variants")
                    .select("id")
                    .in("id", variantIds);

                if (variantCheckError) throw new Error(variantCheckError.message);
                if (existingVariants?.length) {
                    throw new Error(`Variation ID "${existingVariants[0].id}" already exists.`);
                }
            }

            // New products should appear at the end of their own category.
            const { data: lastProduct, error: orderError } = await supabase
                .from("products")
                .select("sort_order")
                .eq("category_key", selectedCategory.key)
                .order("sort_order", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
            if (orderError) throw new Error(orderError.message);
            const nextSortOrder = Number.isFinite(Number(lastProduct?.sort_order))
                ? Number(lastProduct.sort_order) + 1
                : 0;

            const { error: productError } = await supabase.from("products").insert({
                id:            productId,
                category_key:  selectedCategory.key,
                name:          productName.trim(),
                description:   description.trim(),
                sale_unit:     saleUnit.trim(),
                variant_label: variationSetLabel.trim() || "Select Variant",
                hide_price:    hidePrice,
                video:         videoState.status === "ready" ? videoState.url : null,
                sort_order:    nextSortOrder,
            });
            if (productError) throw new Error(productError.message);

            if (variantRows.length > 0) {
                const { error: varError } = await supabase.from("product_variants").insert(variantRows);
                if (varError) throw new Error(varError.message);
            }

            if (images.length > 0) {
                const imageRows = [];
                for (let i = 0; i < images.length; i++) {
                    const image = images[i];
                    let url = null; let filename = image.name;
                    if (image.file) {
                        const ext = image.file.name.split(".").pop();
                        const storagePath = `${productId}/${i}-${Date.now()}.${ext}`;
                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from("product-images").upload(storagePath, image.file, { upsert: false });
                        if (!uploadError && uploadData) {
                            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(storagePath);
                            url = urlData?.publicUrl || null; filename = storagePath;
                        }
                    }
                    imageRows.push({ product_id: productId, filename, url, sort_order: i });
                }
                const { error: imgError } = await supabase.from("product_images").insert(imageRows);
                if (imgError) throw new Error(imgError.message);
            }

            setToast("Product saved successfully!");
            setTimeout(() => { if (onSaved) onSaved(); }, 1000);
        } catch (err) {
            setSaveError(err.message || "Something went wrong. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="add-product-page-wrapper">
            <div className="add-product-page">
                <h2>Add a New Product</h2>
                <hr />

                {/* IMAGES */}
                <div className="form-group">
                    <label>Product Images</label>
                    <p className="helper-text">Drag, reorder, and promote product images. 1:1 optimal.</p>
                    <div className={`image-dropzone ${zoneActive ? "active" : ""}`}
                        onClick={() => inputRef.current?.click()}
                        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
                        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFileInput} />
                        {toast ? <div className="toast-message"><FaCheckCircle />{toast}</div> : null}
                        <div className="dropzone-content">
                            <FaCloudUploadAlt className="upload-icon" />
                            <div className="upload-title">{images.length ? "Drop more or click to add" : "Drag & drop product images here"}</div>
                            <div className="upload-copy">JPG, PNG, WEBP · First image becomes the cover.</div>
                        </div>
                    </div>
                    {images.length > 0 && (
                        <>
                            <div className="media-catalog-header">
                                <span className="media-catalog-title">MEDIA CATALOG ({images.length} ITEM{images.length > 1 ? "S" : ""})</span>
                                <span className="media-catalog-note">Drag cards to reorder</span>
                            </div>
                            <div className="image-upload-grid">
                                {images.map((image, index) => (
                                    <div key={image.id}
                                        className={`image-card ${index === 0 ? "cover" : ""} ${dragOverIndex === index ? "drag-over" : ""}`}
                                        draggable
                                        onDragStart={onDragStart(index)} onDragEnter={() => onDragEnter(index)}
                                        onDragOver={e => e.preventDefault()} onDragEnd={onDragEnd} onDrop={() => onDropOnCard(index)}>
                                        <div className="image-card-inner" style={{ backgroundImage: `url(${image.src})` }}>
                                            <div className="image-card-top"><span className="cover-badge">{index === 0 ? "Cover" : "Gallery"}</span></div>
                                            <div className="image-card-actions">
                                                {index !== 0 && (
                                                    <button className="make-cover-btn" type="button" onClick={e => { e.stopPropagation(); moveToCover(index); }}>
                                                        <FaArrowUp /> Make Cover
                                                    </button>
                                                )}
                                                <button className="delete-btn" type="button" onClick={e => { e.stopPropagation(); removeImage(index); }}>
                                                    <FaTrashAlt />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* VIDEO */}
                <div className="form-group">
                    <label>Product Video (Optional)</label>
                    <p className="helper-text">Upload a short clip or paste a YouTube link.</p>
                    <div className="video-mode-toggle">
                        <button type="button" className={`video-mode-btn ${videoMode === "file" ? "active" : ""}`} onClick={() => setVideoMode("file")}>
                            <FaVideo /> Direct Video File
                        </button>
                        <button type="button" className={`video-mode-btn ${videoMode === "youtube" ? "active" : ""}`} onClick={() => setVideoMode("youtube")}>
                            <FaYoutube /> YouTube Link
                        </button>
                    </div>

                    {videoMode === "file" ? (
                        <div className={`video-dropzone ${videoZoneActive ? "active" : ""}`}
                            onClick={() => videoInputRef.current?.click()}
                            onDrop={e => { e.preventDefault(); handleVideoSelection(e.dataTransfer.files); setVideoZoneActive(false); }}
                            onDragOver={e => { e.preventDefault(); setVideoZoneActive(true); }}
                            onDragLeave={() => setVideoZoneActive(false)}>
                            <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={handleVideoInput} />
                            <div className="dropzone-content">
                                <FaVideo className="upload-icon" />
                                <div className="upload-title">{videoState.status === "ready" && !videoState.type ? "Replace or drop a new video" : "Drag & drop product video here"}</div>
                                <div className="upload-copy">MP4, WebM, MOV · Max 50 MB · Max 60 seconds</div>
                            </div>
                        </div>
                    ) : (
                        <div className="youtube-controls">
                            <div className="youtube-input-row">
                                <input className="youtube-input" type="text"
                                    placeholder="https://youtu.be/VIDEO_ID  or  https://www.youtube.com/watch?v=VIDEO_ID"
                                    value={youtubeInput} onChange={e => setYoutubeInput(e.target.value)} />
                                <button type="button" className="attach-btn" onClick={attachYoutube}>Attach</button>
                            </div>
                            {videoState.status === "error" && <div className="video-error"><FaExclamationTriangle /> {videoState.error}</div>}
                            {videoState.status === "ready" && videoState.type === "youtube" && (
                                <div className="youtube-preview" onClick={() => setVideoLightboxOpen(true)}>
                                    <div className="youtube-badge">YouTube</div>
                                    <img src={`https://i.ytimg.com/vi/${videoState.url.split("/").pop()}/hqdefault.jpg`} alt="YouTube preview" />
                                    <div className="video-meta video-meta-sm"><span>{videoState.name}</span></div>
                                </div>
                            )}
                        </div>
                    )}

                    {videoState.status === "processing" && (
                        <div className="video-card video-card-sm">
                            <div className="video-preview-shell">
                                <div className="video-skeleton"><div className="video-skeleton-pulse" /></div>
                                <div className="video-processing-overlay">
                                    <div className="video-processing-copy">Processing video…</div>
                                    <div className="video-progress-bar"><div className="video-progress-fill" style={{ width: `${videoProgress}%` }} /></div>
                                </div>
                            </div>
                        </div>
                    )}
                    {videoState.status === "ready" && !videoState.type && videoState.url && (
                        <div className="video-ready-note">✓ Video ready: {videoState.name}</div>
                    )}

                    {videoLightboxOpen && (
                        <div className="video-lightbox" onClick={() => setVideoLightboxOpen(false)}>
                            <div className="video-lightbox-panel" onClick={e => e.stopPropagation()}>
                                <button className="video-lightbox-close" type="button" onClick={() => setVideoLightboxOpen(false)}><FaTimes /></button>
                                {videoState.type === "youtube" ? (
                                    <div className="video-lightbox-embed">
                                        <iframe title="YouTube preview" width="100%" height="520"
                                            src={`${videoState.url}?autoplay=1`} frameBorder="0"
                                            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                                    </div>
                                ) : (
                                    <video className="video-lightbox-player" src={videoState.url} controls autoPlay />
                                )}
                                <div className="video-lightbox-label">Product video preview</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* PRODUCT NAME */}
                <div className="form-group">
                    <label>Product Name</label>
                    <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Premium Shrink Wrap Film" />
                </div>

                {/* PRODUCT ID / CODE */}
                <div className="form-group product-id-group">
                    <div className="product-id-label-row">
                        <label>Product ID / Code</label>
                        <span className="id-prefix-badge">
                            Prefix: {getCategoryPrefix(selectedCategory)}
                        </span>
                    </div>
                    <input
                        type="text"
                        value={productCode}
                        onChange={e => setProductCode(e.target.value)}
                        placeholder={`Auto: ${generatedProductIdPreview}`}
                    />
                    {!productCode.trim() ? (
                        <p className="auto-id-preview">
                            Auto-generated Product ID: <code>{generatedProductIdPreview}</code>
                        </p>
                    ) : (
                        <p className="auto-id-preview custom-id-preview">
                            Custom Product ID: <code>{productCode.trim()}</code>
                        </p>
                    )}
                </div>

                {/* SALE UNIT */}
                <div className="form-group">
                    <label>Sale Unit <span className="helper-text">(shown below quantity in product modal)</span></label>
                    <input type="text" value={saleUnit} onChange={e => setSaleUnit(e.target.value)} placeholder="e.g. 1000pcs per order" />
                </div>

                {/* CATEGORY */}
                <div className="form-group category-group" ref={categoryDropdownRef}>
                    <label>Category</label>
                    <div className={`category-trigger ${categoryOpen ? "open" : ""}`}
                        role="button" tabIndex={0}
                        onClick={() => setCategoryOpen(v => !v)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setCategoryOpen(v => !v); } }}>
                        <span>{selectedCategory ? selectedCategory.label : "Search or select a category…"}</span>
                        <span className="chevron" />
                    </div>
                    {categoryOpen && (
                        <div className="category-dropdown">
                            <div className="category-search-box">
                                <FaSearch className="search-icon" />
                                <input type="text" value={categorySearch} placeholder="Search categories"
                                    onChange={e => setCategorySearch(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter" && canCreate) { e.preventDefault(); createCategory(normalizedSearch); } }} />
                            </div>
                            <div className="category-list">
                                {filteredCategories.length > 0
                                    ? filteredCategories.map(cat => (
                                        <button key={cat.key} type="button" className="category-item" onClick={() => selectCategory(cat)}>{cat.label}</button>
                                    ))
                                    : <div className="category-empty">No matching categories</div>
                                }
                                {canCreate && (
                                    <button type="button" className="category-create-shortcut" onClick={() => createCategory(normalizedSearch)}>
                                        ✨ Create: '{normalizedSearch}'
                                    </button>
                                )}
                            </div>
                            <div className="category-footer">
                                {customCategoryMode ? (
                                    <div className="custom-category-form">
                                        <input type="text" value={customCategoryInput} placeholder="Enter category name"
                                            onChange={e => setCustomCategoryInput(e.target.value)} />
                                        <div className="custom-category-actions">
                                            <button type="button" className="btn-secondary" onClick={() => setCustomCategoryMode(false)}>Cancel</button>
                                            <button type="button" className="btn-primary" onClick={() => createCategory(customCategoryInput)}>Create & Assign</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" className="category-add-custom" onClick={() => setCustomCategoryMode(true)}>
                                        + Add Custom Category
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* DESCRIPTION */}
                <div className="form-group">
                    <label>Description</label>
                    <textarea rows="8" value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                {/* VARIATIONS */}
                <div className="variation-section">
                    <div className="variation-header">
                        <div>
                            <h3>Product Variations</h3>
                            <p className="helper-text">Create variants and set pricing per option.</p>
                        </div>
                    </div>
                    <div className="variation-controls">
                        <div className="variation-set-input">
                            <label>Variation Set Label <span className="helper-text">(label shown above variant buttons on storefront)</span></label>
                            <input type="text" value={variationSetLabel} onChange={e => setVariationSetLabel(e.target.value)}
                                placeholder="e.g. Select Size, Select Type, Select Color" />
                        </div>
                        <div className="hide-price-toggle-row">
                            <label className="toggle-switch">
                                <input type="checkbox" checked={hidePrice} onChange={e => setHidePrice(e.target.checked)} />
                                <span className="toggle-slider" />
                            </label>
                            <div className="hide-price-copy">
                                <span className="hide-price-label">Hide Price</span>
                                <span className="hide-price-helper">Don't show pricing on the storefront for this product</span>
                            </div>
                        </div>
                    </div>
                    <div className="variation-table-shell">
                        <div className="variation-row variation-row-head">
                            <div>Variation ID <span className="helper-text">(auto v1, v2...)</span></div>
                            <div>Variation Label</div>
                            <div>Price (₱)</div>
                            <div>Action</div>
                        </div>
                        {variations.map((v, index) => (
                            <div key={v.rowId} className="variation-row">
                                <div className="variation-cell sku-cell">
                                    <input
                                        type="text"
                                        value={v.sku}
                                        onChange={e => updateVariation(v.rowId, "sku", e.target.value)}
                                        className="sku-input"
                                        placeholder={variationIdPreviews[index]}
                                    />
                                    {!v.sku.trim() && (
                                        <small className="variant-id-preview">
                                            Auto: {variationIdPreviews[index]}
                                        </small>
                                    )}
                                </div>
                                <div className="variation-cell">
                                    <input type="text" value={v.label} onChange={e => updateVariation(v.rowId, "label", e.target.value)} placeholder="e.g. 2 inches" />
                                </div>
                                <div className="variation-cell">
                                    <input type="number" value={v.price} onChange={e => updateVariation(v.rowId, "price", e.target.value)} placeholder="0" />
                                </div>
                                <div className="variation-cell action-cell">
                                    <button type="button" className="delete-variation-btn" onClick={() => removeVariation(v.rowId)}><FaTrashAlt /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="variation-action-row">
                        <button type="button" className="variation-btn" onClick={addVariation}>+ Add Variation Option</button>
                    </div>
                </div>

                {saveError && (
                    <div className="save-error">
                        <FaExclamationTriangle /> {saveError}
                    </div>
                )}

                <div className="add-product-actions">
                    <div className="action-buttons-container">
                        <button className="action-btn cancel-btn" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
                        <button className="action-btn primary-btn" type="button" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : "Save and Publish"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
