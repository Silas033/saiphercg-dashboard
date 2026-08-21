// src/pages/Profile.jsx
// Company-page builder connected to Supabase.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FaArrowDown,
    FaArrowUp,
    FaBold,
    FaDesktop,
    FaEye,
    FaImage,
    FaMobileAlt,
    FaPlus,
    FaSave,
    FaShoppingBag,
    FaTrash,
    FaVideo,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import "../styles/profile.css";

const MAX_COMPANY_PAGES = 5;
const COMPANY_BUCKET = "company-media";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const PRODUCT_SELECT = `
    id,
    name,
    category_key,
    hide_price,
    video,
    description,
    sale_unit,
    variant_label,
    product_variants ( id, label, price, sort_order ),
    product_images ( filename, url, sort_order )
`;

function makeId() {
    return globalThis.crypto?.randomUUID?.() ||
        `company-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

function getYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /youtu\.be\/([A-Za-z0-9_-]{11})/,
        /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
        /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
        /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

function shapeProduct(product) {
    return {
        id: product.id,
        name: product.name,
        category: product.category_key,
        hidePrice: product.hide_price,
        video: product.video || null,
        description: product.description || "",
        saleUnit: product.sale_unit || "",
        variantLabel: product.variant_label || "Select Variant",
        variants: [...(product.product_variants || [])]
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
            .map((variant) => ({
                id: variant.id,
                label: variant.label,
                price: Number(variant.price || 0),
            })),
        images: [...(product.product_images || [])]
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
            .map((image) => image.url || image.filename)
            .filter(Boolean),
    };
}

function createBlock(type) {
    const common = { id: makeId(), block_type: type, sort_order: 0 };

    if (type === "text") {
        return {
            ...common,
            content: {
                html: "<p>Enter your company content here.</p>",
                alignment: "left",
            },
            productIds: [],
        };
    }

    if (type === "gallery") {
        return {
            ...common,
            content: { images: [], columns: 3 },
            productIds: [],
        };
    }

    if (type === "youtube") {
        return {
            ...common,
            content: { url: "", caption: "" },
            productIds: [],
        };
    }

    return {
        ...common,
        content: { heading: "Featured Products" },
        productIds: [],
    };
}

function createPage(sortOrder = 0) {
    const id = makeId();
    return {
        id,
        title: "New Company Page",
        nav_label: "New Page",
        slug: `company-page-${String(sortOrder + 1)}`,
        is_published: true,
        sort_order: sortOrder,
        blocks: [createBlock("text")],
        isNew: true,
    };
}

function normalizePage(page) {
    return {
        ...page,
        blocks: [...(page.company_page_blocks || page.blocks || [])]
            .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
            .map((block) => ({
                id: block.id,
                block_type: block.block_type,
                content: block.content || {},
                sort_order: Number(block.sort_order || 0),
                productIds: [...(block.company_page_block_products || [])]
                    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
                    .map((entry) => entry.product_id),
            })),
        isNew: false,
    };
}

function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
}

export default function Profile() {
    const [pages, setPages] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedPageId, setSelectedPageId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingBlockId, setUploadingBlockId] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [previewMode, setPreviewMode] = useState("desktop");
    const [productSearch, setProductSearch] = useState("");

    const loadProducts = useCallback(async () => {
        const { data, error: productError } = await supabase
            .from("products")
            .select(PRODUCT_SELECT)
            .order("sort_order", { ascending: true });

        if (productError) throw productError;
        setProducts((data || []).map(shapeProduct));
    }, []);

    const loadPages = useCallback(async (preferredPageId = null) => {
        const { data, error: pageError } = await supabase
            .from("company_pages")
            .select(`
                id,
                title,
                nav_label,
                slug,
                is_published,
                sort_order,
                company_page_blocks (
                    id,
                    block_type,
                    content,
                    sort_order,
                    company_page_block_products (
                        product_id,
                        sort_order
                    )
                )
            `)
            .order("sort_order", { ascending: true });

        if (pageError) throw pageError;

        const nextPages = (data || []).map(normalizePage);
        setPages(nextPages);

        const targetId =
            preferredPageId && nextPages.some((page) => page.id === preferredPageId)
                ? preferredPageId
                : nextPages.some((page) => page.id === selectedPageId)
                    ? selectedPageId
                    : nextPages[0]?.id || null;

        setSelectedPageId(targetId);
        setDraft(targetId ? deepCopy(nextPages.find((page) => page.id === targetId)) : null);
    }, [selectedPageId]);

    useEffect(() => {
        let mounted = true;

        Promise.all([loadProducts(), loadPages()])
            .catch((loadError) => {
                if (mounted) {
                    setError(
                        loadError?.message ||
                        "Unable to load Company Pages. Run the supplied Supabase SQL first."
                    );
                }
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const productMap = useMemo(
        () => new Map(products.map((product) => [product.id, product])),
        [products]
    );

    const filteredProducts = useMemo(() => {
        const term = productSearch.trim().toLowerCase();
        if (!term) return products;
        return products.filter((product) =>
            `${product.name} ${product.id}`.toLowerCase().includes(term)
        );
    }, [products, productSearch]);

    function selectPage(page) {
        setSelectedPageId(page.id);
        setDraft(deepCopy(page));
        setError("");
        setMessage("");
    }

    function updateDraft(patch) {
        setDraft((current) => ({ ...current, ...patch }));
        setMessage("");
    }

    function addPage() {
        if (pages.length >= MAX_COMPANY_PAGES) {
            setError("The Company dropdown supports a maximum of five pages.");
            return;
        }

        const page = createPage(pages.length);
        setSelectedPageId(page.id);
        setDraft(page);
        setError("");
        setMessage("New page created locally. Click Save Page to publish it to Supabase.");
    }

    async function updatePageOrder(nextPages) {
        setPages(nextPages);
        await Promise.all(
            nextPages.map((page, index) =>
                supabase
                    .from("company_pages")
                    .update({ sort_order: index })
                    .eq("id", page.id)
            )
        );
    }

    async function movePage(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= pages.length) return;

        const next = [...pages];
        [next[index], next[target]] = [next[target], next[index]];
        const normalized = next.map((page, sortOrder) => ({
            ...page,
            sort_order: sortOrder,
        }));

        try {
            await updatePageOrder(normalized);
            setMessage("Company dropdown order updated.");
        } catch (moveError) {
            setError(moveError?.message || "Unable to reorder Company pages.");
            await loadPages(selectedPageId);
        }
    }

    function addBlock(type) {
        setDraft((current) => ({
            ...current,
            blocks: [
                ...(current.blocks || []),
                { ...createBlock(type), sort_order: current.blocks?.length || 0 },
            ],
        }));
    }

    function updateBlock(blockId, updater) {
        setDraft((current) => ({
            ...current,
            blocks: current.blocks.map((block) =>
                block.id === blockId
                    ? typeof updater === "function"
                        ? updater(block)
                        : { ...block, ...updater }
                    : block
            ),
        }));
    }

    function moveBlock(index, direction) {
        const target = index + direction;
        if (!draft || target < 0 || target >= draft.blocks.length) return;

        const next = [...draft.blocks];
        [next[index], next[target]] = [next[target], next[index]];
        updateDraft({
            blocks: next.map((block, sortOrder) => ({ ...block, sort_order: sortOrder })),
        });
    }

    async function removeBlock(block) {
        const galleryImages = block.block_type === "gallery" ? block.content?.images || [] : [];
        const paths = galleryImages.map((image) => image.path).filter(Boolean);

        if (paths.length) {
            await supabase.storage.from(COMPANY_BUCKET).remove(paths);
        }

        setDraft((current) => ({
            ...current,
            blocks: current.blocks
                .filter((item) => item.id !== block.id)
                .map((item, sortOrder) => ({ ...item, sort_order: sortOrder })),
        }));
    }

    async function uploadImages(blockId, fileList) {
        const files = Array.from(fileList || []);
        if (!files.length || !draft) return;

        setError("");
        setUploadingBlockId(blockId);

        try {
            const uploaded = [];

            for (const file of files) {
                if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                    throw new Error(`${file.name}: only JPG, PNG, WEBP, and GIF are allowed.`);
                }
                if (file.size > MAX_IMAGE_SIZE) {
                    throw new Error(`${file.name}: image must be 8 MB or smaller.`);
                }

                const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
                const path = `${draft.id}/${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 9)}.${extension}`;

                const { error: uploadError } = await supabase.storage
                    .from(COMPANY_BUCKET)
                    .upload(path, file, { cacheControl: "3600", upsert: false });

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from(COMPANY_BUCKET)
                    .getPublicUrl(path);

                uploaded.push({
                    id: makeId(),
                    path,
                    url: publicUrlData.publicUrl,
                    alt: file.name.replace(/\.[^.]+$/, ""),
                    caption: "",
                });
            }

            updateBlock(blockId, (block) => ({
                ...block,
                content: {
                    ...block.content,
                    images: [...(block.content?.images || []), ...uploaded],
                },
            }));
            setMessage(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.`);
        } catch (uploadError) {
            setError(uploadError?.message || "Unable to upload image.");
        } finally {
            setUploadingBlockId(null);
        }
    }

    async function removeGalleryImage(blockId, image) {
        if (image.path) {
            const { error: removeError } = await supabase.storage
                .from(COMPANY_BUCKET)
                .remove([image.path]);
            if (removeError) setError(removeError.message);
        }

        updateBlock(blockId, (block) => ({
            ...block,
            content: {
                ...block.content,
                images: (block.content?.images || []).filter((item) => item.id !== image.id),
            },
        }));
    }

    async function savePage() {
        if (!draft) return;

        const title = draft.title.trim();
        const navLabel = draft.nav_label.trim();
        const slug = slugify(draft.slug || title);

        if (!title) {
            setError("Page title is required.");
            return;
        }
        if (!navLabel) {
            setError("Dropdown label is required.");
            return;
        }
        if (!slug) {
            setError("A valid page slug is required.");
            return;
        }
        if (draft.isNew && pages.length >= MAX_COMPANY_PAGES) {
            setError("The Company dropdown supports a maximum of five pages.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const pagePayload = {
                id: draft.id,
                title,
                nav_label: navLabel,
                slug,
                is_published: Boolean(draft.is_published),
                sort_order: draft.isNew ? pages.length : Number(draft.sort_order || 0),
            };

            const { error: pageError } = await supabase
                .from("company_pages")
                .upsert(pagePayload, { onConflict: "id" });
            if (pageError) throw pageError;

            const { error: deleteBlocksError } = await supabase
                .from("company_page_blocks")
                .delete()
                .eq("page_id", draft.id);
            if (deleteBlocksError) throw deleteBlocksError;

            const normalizedBlocks = (draft.blocks || []).map((block, sortOrder) => ({
                id: block.id || makeId(),
                page_id: draft.id,
                block_type: block.block_type,
                content: block.content || {},
                sort_order: sortOrder,
            }));

            if (normalizedBlocks.length) {
                const { error: blockError } = await supabase
                    .from("company_page_blocks")
                    .insert(normalizedBlocks);
                if (blockError) throw blockError;
            }

            const productRows = [];
            (draft.blocks || []).forEach((block) => {
                if (block.block_type !== "products") return;
                (block.productIds || []).forEach((productId, sortOrder) => {
                    productRows.push({
                        block_id: block.id,
                        product_id: productId,
                        sort_order: sortOrder,
                    });
                });
            });

            if (productRows.length) {
                const { error: productLinkError } = await supabase
                    .from("company_page_block_products")
                    .insert(productRows);
                if (productLinkError) throw productLinkError;
            }

            await loadPages(draft.id);
            setMessage("Company page saved. The storefront will refresh automatically.");
        } catch (saveError) {
            setError(saveError?.message || "Unable to save the Company page.");
        } finally {
            setSaving(false);
        }
    }

    async function deletePage() {
        if (!draft) return;
        if (draft.isNew) {
            setDraft(null);
            setSelectedPageId(pages[0]?.id || null);
            if (pages[0]) setDraft(deepCopy(pages[0]));
            return;
        }

        const confirmed = window.confirm(`Delete “${draft.title}” and all of its content?`);
        if (!confirmed) return;

        setSaving(true);
        setError("");

        try {
            const imagePaths = (draft.blocks || [])
                .filter((block) => block.block_type === "gallery")
                .flatMap((block) => block.content?.images || [])
                .map((image) => image.path)
                .filter(Boolean);

            if (imagePaths.length) {
                await supabase.storage.from(COMPANY_BUCKET).remove(imagePaths);
            }

            const { error: deleteError } = await supabase
                .from("company_pages")
                .delete()
                .eq("id", draft.id);
            if (deleteError) throw deleteError;

            await loadPages();
            setMessage("Company page deleted.");
        } catch (deleteError) {
            setError(deleteError?.message || "Unable to delete the Company page.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <div className="company-admin-state">Loading Company Pages…</div>;
    }

    return (
        <section className="company-admin-page">
            <header className="company-admin-header">
                <div>
                    <span className="company-admin-kicker">Storefront content manager</span>
                    <h1>Company Pages</h1>
                    <p>
                        Build up to five Company dropdown pages using rich text, image galleries,
                        YouTube videos, and products.
                    </p>
                </div>
                <button
                    type="button"
                    className="company-primary-button"
                    onClick={addPage}
                    disabled={pages.length >= MAX_COMPANY_PAGES || Boolean(draft?.isNew)}
                >
                    <FaPlus /> Add Company Page
                </button>
            </header>

            {error && <div className="company-admin-alert error">{error}</div>}
            {message && <div className="company-admin-alert success">{message}</div>}

            <div className="company-admin-layout">
                <aside className="company-page-list-panel">
                    <div className="company-panel-heading">
                        <div>
                            <strong>Dropdown Pages</strong>
                            <span>{pages.length}/{MAX_COMPANY_PAGES} saved</span>
                        </div>
                    </div>

                    <div className="company-page-list">
                        {pages.map((page, index) => (
                            <div
                                key={page.id}
                                className={`company-page-list-item ${
                                    selectedPageId === page.id ? "active" : ""
                                }`}
                            >
                                <button type="button" onClick={() => selectPage(page)}>
                                    <strong>{page.nav_label}</strong>
                                    <span>{page.is_published ? "Published" : "Hidden"}</span>
                                </button>
                                <div className="company-page-order-buttons">
                                    <button
                                        type="button"
                                        title="Move up"
                                        onClick={() => movePage(index, -1)}
                                        disabled={index === 0}
                                    >
                                        <FaArrowUp />
                                    </button>
                                    <button
                                        type="button"
                                        title="Move down"
                                        onClick={() => movePage(index, 1)}
                                        disabled={index === pages.length - 1}
                                    >
                                        <FaArrowDown />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {draft?.isNew && (
                            <div className="company-page-list-item active draft-item">
                                <button type="button">
                                    <strong>{draft.nav_label || "New Page"}</strong>
                                    <span>Unsaved</span>
                                </button>
                            </div>
                        )}

                        {!pages.length && !draft && (
                            <div className="company-empty-list">
                                No Company pages yet. Create the first page to begin.
                            </div>
                        )}
                    </div>
                </aside>

                <main className="company-editor-panel">
                    {!draft ? (
                        <div className="company-editor-empty">
                            <FaPlus />
                            <h2>Create your first Company page</h2>
                            <p>The page will appear inside the storefront Company dropdown.</p>
                            <button type="button" onClick={addPage} className="company-primary-button">
                                Add Company Page
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="company-page-settings">
                                <div className="company-field">
                                    <label htmlFor="company-page-title">Page Title</label>
                                    <input
                                        id="company-page-title"
                                        value={draft.title}
                                        onChange={(event) => {
                                            const title = event.target.value;
                                            updateDraft({
                                                title,
                                                ...(draft.isNew ? { slug: slugify(title) } : {}),
                                            });
                                        }}
                                        placeholder="About Saipher CG"
                                    />
                                </div>

                                <div className="company-field">
                                    <label htmlFor="company-nav-label">Dropdown Label</label>
                                    <input
                                        id="company-nav-label"
                                        value={draft.nav_label}
                                        maxLength={40}
                                        onChange={(event) =>
                                            updateDraft({ nav_label: event.target.value })
                                        }
                                        placeholder="About Us"
                                    />
                                </div>

                                <div className="company-field">
                                    <label htmlFor="company-page-slug">Page Slug</label>
                                    <input
                                        id="company-page-slug"
                                        value={draft.slug}
                                        onChange={(event) =>
                                            updateDraft({ slug: slugify(event.target.value) })
                                        }
                                        placeholder="about-us"
                                    />
                                </div>

                                <label className="company-publish-toggle">
                                    <input
                                        type="checkbox"
                                        checked={draft.is_published}
                                        onChange={(event) =>
                                            updateDraft({ is_published: event.target.checked })
                                        }
                                    />
                                    <span />
                                    Published on storefront
                                </label>
                            </div>

                            <div className="company-builder-toolbar">
                                <div>
                                    <strong>Add Content</strong>
                                    <span>Blocks are displayed from top to bottom.</span>
                                </div>
                                <div className="company-add-block-buttons">
                                    <button type="button" onClick={() => addBlock("text")}>
                                        <FaBold /> Text
                                    </button>
                                    <button type="button" onClick={() => addBlock("gallery")}>
                                        <FaImage /> Images
                                    </button>
                                    <button type="button" onClick={() => addBlock("youtube")}>
                                        <FaVideo /> YouTube
                                    </button>
                                    {/* Temporarily hidden: product block creation */}
                                    {/* <button type="button" onClick={() => addBlock("products")}>
                                        <FaShoppingBag /> Products
                                    </button> */}
                                </div>
                            </div>

                            <div className="company-block-list">
                                {(draft.blocks || []).map((block, index) => (
                                    <article className="company-block-card" key={block.id}>
                                        <header className="company-block-card-header">
                                            <div>
                                                <span>Block {index + 1}</span>
                                                <strong>{block.block_type}</strong>
                                            </div>
                                            <div className="company-block-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => moveBlock(index, -1)}
                                                    disabled={index === 0}
                                                    title="Move block up"
                                                >
                                                    <FaArrowUp />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveBlock(index, 1)}
                                                    disabled={index === draft.blocks.length - 1}
                                                    title="Move block down"
                                                >
                                                    <FaArrowDown />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="danger"
                                                    onClick={() => removeBlock(block)}
                                                    title="Delete block"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
                                        </header>

                                        <BlockEditor
                                            block={block}
                                            updateBlock={updateBlock}
                                            uploadImages={uploadImages}
                                            removeGalleryImage={removeGalleryImage}
                                            uploading={uploadingBlockId === block.id}
                                            products={filteredProducts}
                                            productSearch={productSearch}
                                            setProductSearch={setProductSearch}
                                        />
                                    </article>
                                ))}
                            </div>

                            <div className="company-save-bar">
                                <button
                                    type="button"
                                    className="company-delete-page-button"
                                    onClick={deletePage}
                                    disabled={saving}
                                >
                                    <FaTrash /> Delete Page
                                </button>
                                <button
                                    type="button"
                                    className="company-primary-button"
                                    onClick={savePage}
                                    disabled={saving}
                                >
                                    <FaSave /> {saving ? "Saving…" : "Save Page"}
                                </button>
                            </div>
                        </>
                    )}
                </main>

                <aside className="company-preview-panel">
                    <div className="company-preview-header">
                        <div>
                            <FaEye />
                            <strong>Live Preview</strong>
                        </div>
                        <div className="company-preview-modes">
                            <button
                                type="button"
                                className={previewMode === "desktop" ? "active" : ""}
                                onClick={() => setPreviewMode("desktop")}
                                title="Desktop preview"
                            >
                                <FaDesktop />
                            </button>
                            <button
                                type="button"
                                className={previewMode === "mobile" ? "active" : ""}
                                onClick={() => setPreviewMode("mobile")}
                                title="Mobile preview"
                            >
                                <FaMobileAlt />
                            </button>
                        </div>
                    </div>

                    <div className={`company-preview-frame ${previewMode}`}>
                        {draft ? (
                            <CompanyPreview page={draft} productMap={productMap} />
                        ) : (
                            <div className="company-preview-empty">Select or create a page.</div>
                        )}
                    </div>
                </aside>
            </div>
        </section>
    );
}

function BlockEditor({
    block,
    updateBlock,
    uploadImages,
    removeGalleryImage,
    uploading,
    products,
    productSearch,
    setProductSearch,
}) {
    if (block.block_type === "text") {
        return (
            <RichTextEditor
                html={block.content?.html || ""}
                onChange={(html) =>
                    updateBlock(block.id, (current) => ({
                        ...current,
                        content: { ...current.content, html },
                    }))
                }
            />
        );
    }

    if (block.block_type === "gallery") {
        const images = block.content?.images || [];
        return (
            <div className="company-gallery-editor">
                <div className="company-gallery-editor-toolbar">
                    <label className="company-upload-button">
                        <FaImage /> {uploading ? "Uploading…" : "Upload Multiple Images"}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            multiple
                            hidden
                            disabled={uploading}
                            onChange={(event) => {
                                uploadImages(block.id, event.target.files);
                                event.target.value = "";
                            }}
                        />
                    </label>
                    <label>
                        Columns
                        <select
                            value={block.content?.columns || 3}
                            onChange={(event) =>
                                updateBlock(block.id, (current) => ({
                                    ...current,
                                    content: {
                                        ...current.content,
                                        columns: Number(event.target.value),
                                    },
                                }))
                            }
                        >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                        </select>
                    </label>
                </div>

                {images.length ? (
                    <div className="company-gallery-editor-grid">
                        {images.map((image) => (
                            <div className="company-gallery-editor-item" key={image.id}>
                                <img src={image.url} alt={image.alt || "Company"} />
                                <input
                                    value={image.alt || ""}
                                    placeholder="Image description"
                                    onChange={(event) =>
                                        updateBlock(block.id, (current) => ({
                                            ...current,
                                            content: {
                                                ...current.content,
                                                images: current.content.images.map((item) =>
                                                    item.id === image.id
                                                        ? { ...item, alt: event.target.value }
                                                        : item
                                                ),
                                            },
                                        }))
                                    }
                                />
                                <input
                                    value={image.caption || ""}
                                    placeholder="Optional caption"
                                    onChange={(event) =>
                                        updateBlock(block.id, (current) => ({
                                            ...current,
                                            content: {
                                                ...current.content,
                                                images: current.content.images.map((item) =>
                                                    item.id === image.id
                                                        ? { ...item, caption: event.target.value }
                                                        : item
                                                ),
                                            },
                                        }))
                                    }
                                />
                                <button
                                    type="button"
                                    onClick={() => removeGalleryImage(block.id, image)}
                                >
                                    <FaTrash /> Remove
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="company-block-empty">No images uploaded yet.</div>
                )}
            </div>
        );
    }

    if (block.block_type === "youtube") {
        const videoId = getYouTubeId(block.content?.url || "");
        return (
            <div className="company-youtube-editor">
                <label>
                    YouTube Link
                    <input
                        type="url"
                        value={block.content?.url || ""}
                        placeholder="https://www.youtube.com/watch?v=..."
                        onChange={(event) =>
                            updateBlock(block.id, (current) => ({
                                ...current,
                                content: { ...current.content, url: event.target.value },
                            }))
                        }
                    />
                </label>
                <label>
                    Caption
                    <input
                        value={block.content?.caption || ""}
                        placeholder="Optional video caption"
                        onChange={(event) =>
                            updateBlock(block.id, (current) => ({
                                ...current,
                                content: { ...current.content, caption: event.target.value },
                            }))
                        }
                    />
                </label>
                {videoId ? (
                    <div className="company-youtube-preview">
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube preview"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                ) : block.content?.url ? (
                    <small className="company-inline-error">Enter a valid YouTube link.</small>
                ) : null}
            </div>
        );
    }

    return (
        <div className="company-products-editor">
            <label>
                Section Heading
                <input
                    value={block.content?.heading || ""}
                    onChange={(event) =>
                        updateBlock(block.id, (current) => ({
                            ...current,
                            content: { ...current.content, heading: event.target.value },
                        }))
                    }
                    placeholder="Featured Products"
                />
            </label>
            <input
                className="company-product-search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search products by name or ID…"
            />
            <div className="company-product-picker">
                {products.map((product) => {
                    const checked = (block.productIds || []).includes(product.id);
                    return (
                        <label key={product.id} className={checked ? "selected" : ""}>
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                    updateBlock(block.id, (current) => ({
                                        ...current,
                                        productIds: event.target.checked
                                            ? [...(current.productIds || []), product.id]
                                            : (current.productIds || []).filter(
                                                (id) => id !== product.id
                                            ),
                                    }))
                                }
                            />
                            {product.images?.[0] ? (
                                <img src={product.images[0]} alt="" />
                            ) : (
                                <span className="company-product-placeholder" />
                            )}
                            <span>
                                <strong>{product.name}</strong>
                                <small>{product.id}</small>
                            </span>
                        </label>
                    );
                })}
            </div>
            <small>{block.productIds?.length || 0} product(s) selected.</small>
        </div>
    );
}

function RichTextEditor({ html, onChange }) {
    const editorRef = useRef(null);
    const savedRangeRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== html) {
            editorRef.current.innerHTML = html || "";
        }
    }, [html]);

    function saveSelection() {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
            savedRangeRef.current = selection.getRangeAt(0).cloneRange();
        }
    }

    function restoreSelection() {
        if (!savedRangeRef.current) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
    }

    function runCommand(command, value = null) {
        editorRef.current?.focus();
        restoreSelection();
        document.execCommand(command, false, value);
        saveSelection();
        onChange(editorRef.current?.innerHTML || "");
    }

    return (
        <div className="company-rich-editor">
            <div className="company-rich-toolbar">
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runCommand("bold")}
                    title="Bold selected text"
                >
                    <FaBold />
                </button>
                <label title="Font color">
                    Color
                    <input
                        type="color"
                        defaultValue="#dddddd"
                        onMouseDown={saveSelection}
                        onChange={(event) => runCommand("foreColor", event.target.value)}
                    />
                </label>
                <select
                    defaultValue="Arial"
                    onMouseDown={saveSelection}
                    onChange={(event) => runCommand("fontName", event.target.value)}
                    title="Font style"
                >
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Times New Roman">Times New Roman</option>
                </select>
                <select
                    defaultValue="3"
                    onMouseDown={saveSelection}
                    onChange={(event) => runCommand("fontSize", event.target.value)}
                    title="Font size"
                >
                    <option value="1">10 px</option>
                    <option value="2">13 px</option>
                    <option value="3">16 px</option>
                    <option value="4">18 px</option>
                    <option value="5">24 px</option>
                    <option value="6">32 px</option>
                    <option value="7">48 px</option>
                </select>
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runCommand("justifyLeft")}
                >
                    Left
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runCommand("justifyCenter")}
                >
                    Center
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runCommand("justifyFull")}
                >
                    Justify
                </button>
            </div>
            <div
                ref={editorRef}
                className="company-rich-editor-area"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) => onChange(event.currentTarget.innerHTML)}
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                onBlur={saveSelection}
            />
        </div>
    );
}

function CompanyPreview({ page, productMap }) {
    return (
        <div className="company-preview-storefront">
            <div className="company-preview-page-title">{page.title}</div>
            {(page.blocks || []).map((block) => {
                if (block.block_type === "text") {
                    return (
                        <div
                            key={block.id}
                            className="company-preview-rich-text"
                            dangerouslySetInnerHTML={{ __html: block.content?.html || "" }}
                        />
                    );
                }

                if (block.block_type === "gallery") {
                    const images = block.content?.images || [];
                    return (
                        <div
                            key={block.id}
                            className="company-preview-gallery"
                            style={{
                                gridTemplateColumns: `repeat(${Math.min(
                                    Number(block.content?.columns || 3),
                                    4
                                )}, minmax(0, 1fr))`,
                            }}
                        >
                            {images.map((image) => (
                                <figure key={image.id}>
                                    <img src={image.url} alt={image.alt || "Company"} />
                                    {image.caption && <figcaption>{image.caption}</figcaption>}
                                </figure>
                            ))}
                        </div>
                    );
                }

                if (block.block_type === "youtube") {
                    const videoId = getYouTubeId(block.content?.url || "");
                    if (!videoId) return null;
                    return (
                        <figure key={block.id} className="company-preview-video">
                            <iframe
                                src={`https://www.youtube.com/embed/${videoId}`}
                                title={block.content?.caption || "Company video"}
                                allowFullScreen
                            />
                            {block.content?.caption && (
                                <figcaption>{block.content.caption}</figcaption>
                            )}
                        </figure>
                    );
                }

                const selectedProducts = (block.productIds || [])
                    .map((id) => productMap.get(id))
                    .filter(Boolean);

                return (
                    <section key={block.id} className="company-preview-products">
                        <h3>{block.content?.heading || "Featured Products"}</h3>
                        <div>
                            {selectedProducts.map((product) => (
                                <article key={product.id}>
                                    {product.images?.[0] && (
                                        <img src={product.images[0]} alt={product.name} />
                                    )}
                                    <strong>{product.name}</strong>
                                </article>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
