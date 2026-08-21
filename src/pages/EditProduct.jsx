// src/pages/EditProduct.jsx
// Fully wired to Supabase. On "Save Changes":
//   1. Updates the products row
//   2. Deletes all old product_variants and re-inserts current ones
//   3. Deletes removed images from product_images (and Storage if possible)
//      and uploads any new image files to Storage, then upserts product_images rows

import { useEffect, useRef, useState } from "react";
import {
    FaArrowUp, FaCheckCircle, FaCloudUploadAlt,
    FaSearch, FaTrashAlt, FaTimes,
    FaVideo, FaYoutube, FaExclamationTriangle, FaArrowLeft,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import "../styles/addproduct.css";

const ACCEPTED_TYPES     = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES        = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_SIZE     = 50 * 1024 * 1024;
const MAX_VIDEO_DURATION = 60;

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

// Build image list from existing product — marks them as "existing" so we
// know not to re-upload them, just preserve their URL.
function buildInitialImages(product) {
    if (!product?.images?.length) return [];
    return product.images.map((src, i) => ({
        id: `existing-${i}-${src}`,
        name: `image-${i + 1}`,
        src,
        file: null,      // null = already in Storage, no re-upload needed
        existing: true,
    }));
}

function buildInitialVideoState(product) {
    if (!product?.video) return { status: "idle", url: "", name: "", duration: 0, error: "" };
    const isYoutube = product.video.includes("youtube.com/embed");
    return {
        status: "ready", url: product.video,
        name: isYoutube ? "Current YouTube video" : "Current product video",
        duration: 0, error: "",
        type: isYoutube ? "youtube" : "file",
        existing: true,
    };
}

function buildInitialVariations(product) {
    if (!product?.variations?.length) return [];
    return product.variations.map((v, i) => ({
        rowId: `existing-var-${i}-${v.id}`,
        sku:   v.id    || "",   // variant id
        label: v.label || "",
        price: v.price ?? "",
    }));
}

export default function EditProduct({ product, onCancel, onSave }) {
    // Form fields
    const [productName,       setProductName]       = useState(product?.name        || "");
    const [productCode,       setProductCode]       = useState(product?.id          || "");
    const [description,       setDescription]       = useState(product?.description || "");
    const [saleUnit,          setSaleUnit]          = useState(product?.saleUnit     || "");
    const [variationSetLabel, setVariationSetLabel] = useState(product?.variantLabel || "");
    const [hidePrice,         setHidePrice]         = useState(product?.hidePrice   ?? false);
    const [variations,        setVariations]        = useState(() => buildInitialVariations(product));

    // Media
    const [images,            setImages]            = useState(() => buildInitialImages(product));
    const [zoneActive,        setZoneActive]        = useState(false);
    const [dragOverIndex,     setDragOverIndex]     = useState(null);
    const [videoState,        setVideoState]        = useState(() => buildInitialVideoState(product));
    const [videoMode,         setVideoMode]         = useState(() => product?.video?.includes("youtube.com/embed") ? "youtube" : "file");
    const [videoProgress,     setVideoProgress]     = useState(0);
    const [videoZoneActive,   setVideoZoneActive]   = useState(false);
    const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
    const [youtubeInput,      setYoutubeInput]      = useState("");

    // Category
    const [categories,          setCategories]          = useState([]);
    const [selectedCategory,    setSelectedCategory]    = useState(null);
    const [categoryOpen,        setCategoryOpen]        = useState(false);
    const [categorySearch,      setCategorySearch]      = useState("");
    const [customCategoryMode,  setCustomCategoryMode]  = useState(false);
    const [customCategoryInput, setCustomCategoryInput] = useState("");

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

    // Load real categories from Supabase, then match current product category
    useEffect(() => {
        supabase.from("categories").select("key, label").order("sort_order")
            .then(({ data, error }) => {
                if (!error && data) {
                    setCategories(data);
                    // Pre-select the product's current category
                    const match = data.find(c => c.key === product?.category);
                    if (match) setSelectedCategory(match);
                }
            });
    }, [product?.category]);

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
            return { id: `new-${file.name}-${Date.now()}-${i}`, name: file.name, src, file, existing: false };
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
        setYoutubeInput(""); setVideoLightboxOpen(true);
    };

    // ── Category ──────────────────────────────────────────────
    const filteredCategories = categories.filter(c => c.label.toLowerCase().includes(categorySearch.toLowerCase()));
    const normalizedSearch   = categorySearch.trim();
    const exactMatch         = categories.some(c => c.label.toLowerCase() === normalizedSearch.toLowerCase());
    const canCreate          = normalizedSearch.length > 0 && !exactMatch;
    const variationIdPreviews = buildVariantIdPreviews(
        productCode || product?.id || "PRD",
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

    // ── Save to Supabase ──────────────────────────────────────
    const handleSave = async () => {
        if (!productName.trim()) { setSaveError("Product name is required."); return; }
        if (!selectedCategory)   { setSaveError("Please select a category."); return; }
        setSaving(true); setSaveError("");

        try {
            const productId = product.id;
            let nextSortOrder = Number.isFinite(Number(product.sortOrder))
                ? Number(product.sortOrder)
                : 0;

            // Moving a product to another category should append it to that
            // category rather than reusing its old category position.
            if (selectedCategory.key !== product.category) {
                const { data: lastProduct, error: orderError } = await supabase
                    .from("products")
                    .select("sort_order")
                    .eq("category_key", selectedCategory.key)
                    .order("sort_order", { ascending: false, nullsFirst: false })
                    .limit(1)
                    .maybeSingle();
                if (orderError) throw new Error(orderError.message);
                nextSortOrder = Number.isFinite(Number(lastProduct?.sort_order))
                    ? Number(lastProduct.sort_order) + 1
                    : 0;
            }

            // 1. Update the product row
            const { error: productError } = await supabase.from("products").update({
                name:          productName.trim(),
                category_key:  selectedCategory.key,
                description:   description.trim(),
                sale_unit:     saleUnit.trim(),
                variant_label: variationSetLabel.trim() || "Select Variant",
                hide_price:    hidePrice,
                video:         videoState.status === "ready" ? videoState.url : null,
                sort_order:    nextSortOrder,
                updated_at:    new Date().toISOString(),
            }).eq("id", productId);
            if (productError) throw new Error(productError.message);

            // 2. Replace all variants — blank IDs use productId-v1, productId-v2, etc.
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
                const { data: conflictingVariants, error: variantCheckError } = await supabase
                    .from("product_variants")
                    .select("id, product_id")
                    .in("id", variantIds)
                    .neq("product_id", productId);

                if (variantCheckError) throw new Error(variantCheckError.message);
                if (conflictingVariants?.length) {
                    throw new Error(`Variation ID "${conflictingVariants[0].id}" is already used by another product.`);
                }
            }

            const { error: delVarError } = await supabase.from("product_variants").delete().eq("product_id", productId);
            if (delVarError) throw new Error(delVarError.message);

            if (variantRows.length > 0) {
                const { error: varError } = await supabase.from("product_variants").insert(variantRows);
                if (varError) throw new Error(varError.message);
            }

            // 3. Replace all images — delete old rows, upload new files, insert rows
            const { error: delImgError } = await supabase.from("product_images").delete().eq("product_id", productId);
            if (delImgError) throw new Error(delImgError.message);

            if (images.length > 0) {
                const imageRows = [];
                for (let i = 0; i < images.length; i++) {
                    const image = images[i];

                    if (image.existing) {
                        // Already in Storage — just re-insert the row with new sort_order
                        imageRows.push({ product_id: productId, filename: image.name, url: image.src, sort_order: i });
                    } else if (image.file) {
                        // New file — upload to Storage first
                        const ext = image.file.name.split(".").pop();
                        const storagePath = `${productId}/${i}-${Date.now()}.${ext}`;
                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from("product-images").upload(storagePath, image.file, { upsert: false });
                        let url = null; let filename = image.name;
                        if (!uploadError && uploadData) {
                            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(storagePath);
                            url = urlData?.publicUrl || null; filename = storagePath;
                        }
                        imageRows.push({ product_id: productId, filename, url, sort_order: i });
                    }
                }
                const { error: imgError } = await supabase.from("product_images").insert(imageRows);
                if (imgError) throw new Error(imgError.message);
            }

            setToast("Product updated successfully!");
            setTimeout(() => { if (onSave) onSave(); }, 800);

        } catch (err) {
            setSaveError(err.message || "Something went wrong. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="add-product-page-wrapper">
            <div className="add-product-page">
                <button type="button" className="edit-back-link" onClick={onCancel}>
                    <FaArrowLeft /> Back to Product Catalog
                </button>
                <h2>Edit Product</h2>
                <p className="helper-text edit-subtitle">
                    Updating <strong>{product?.name || "this product"}</strong>
                    {product?.id ? <span className="sku-pill edit-sku-pill">{product.id}</span> : null}
                </p>
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
                    {videoState.status === "ready" && videoState.existing && videoState.type !== "youtube" && (
                        <div className="video-ready-note">✓ Current video: {videoState.name}</div>
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

                {/* PRODUCT CODE — read-only, ID cannot change after creation */}
                <div className="form-group">
                    <label>Product Code <span className="helper-text">(cannot be changed after creation)</span></label>
                    <input type="text" value={productCode} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
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
                            <p className="helper-text">Edit variants and pricing.</p>
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
                        <button type="button" className="action-btn cancel-btn" onClick={onCancel} disabled={saving}>Cancel</button>
                        <button type="button" className="action-btn primary-btn" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
