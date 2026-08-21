// src/pages/Products.jsx
// Fetches real products from Supabase. Features:
//   - Real category filter (derived from loaded products)
//   - Search by name or product ID
//   - Drawer with gallery, video (file + YouTube), variants
//   - Image lightbox
//   - Delete with confirmation (cascades variants + images via DB)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/products.css";
import {
    FaChevronLeft, FaChevronRight, FaPlay,
    FaSearch, FaTimes, FaPen, FaTrash, FaExclamationTriangle,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";

function isYouTubeUrl(url) {
    return Boolean(url && url.includes("youtube.com/embed"));
}

function VideoPlayer({ src, videoRef, onLoadedMetadata, className }) {
    if (!src) return null;
    if (isYouTubeUrl(src)) {
        return (
            <iframe src={src} className={className}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="Product video" frameBorder="0" />
        );
    }
    return <video ref={videoRef} onLoadedMetadata={onLoadedMetadata} controls src={src} className={className} />;
}

const PRODUCT_SELECT = `
    id, name, category_key, hide_price, video,
    description, sale_unit, variant_label, sort_order,
    product_variants ( id, label, price, sort_order ),
    product_images   ( filename, url, sort_order )
`;

function shapeProduct(p) {
    const imgs = (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
    const vars = (p.product_variants || []).sort((a, b) => a.sort_order - b.sort_order);
    return {
        id:           p.id,
        name:         p.name,
        category:     p.category_key,
        hidePrice:    p.hide_price,
        video:        p.video || null,
        description:  p.description || "",
        saleUnit:     p.sale_unit || "",
        variantLabel: p.variant_label || "Select Variant",
        sortOrder:    Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0,
        cover:        imgs[0]?.url || imgs[0]?.filename || "",
        images:       imgs.map(i => i.url || i.filename),
        variations:   vars.map(v => ({ id: v.id, label: v.label, price: v.price })),
    };
}

export default function Products({ onEditProduct }) {
    const [products,     setProducts]     = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [fetchError,   setFetchError]   = useState("");
    const [query,          setQuery]          = useState("");
    const [categoryFilter, setCategoryFilter] = useState("All Categories");
    const [drawerOpen,          setDrawerOpen]          = useState(false);
    const [selected,            setSelected]            = useState(null);
    const [activeImgIndex,      setActiveImgIndex]      = useState(0);
    const [inlineVideoExpanded, setInlineVideoExpanded] = useState(true);
    const [videoDuration,       setVideoDuration]       = useState(0);
    const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
    const [lightboxSrc,       setLightboxSrc]       = useState(null);
    const [deleteTarget,  setDeleteTarget]  = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const videoRef    = useRef(null);
    const touchStartX = useRef(null);
    const touchMoved  = useRef(false);

    const loadProducts = useCallback(async () => {
        setLoading(true); setFetchError("");
        const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).order("sort_order");
        if (error) { setFetchError("Failed to load products. Please try again."); setLoading(false); return; }
        setProducts(data.map(shapeProduct));
        setLoading(false);
    }, []);

    useEffect(() => { loadProducts(); }, [loadProducts]);

    const categoryOptions = useMemo(() =>
        ["All Categories", ...new Set(products.map(p => p.category))], [products]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return products.filter(p => {
            if (categoryFilter !== "All Categories" && p.category !== categoryFilter) return false;
            if (!q) return true;
            return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
        });
    }, [products, query, categoryFilter]);

    const openDrawer = (product) => {
        setSelected(product); setActiveImgIndex(0);
        setInlineVideoExpanded(true); setVideoDuration(0);
        setDrawerOpen(true); document.body.style.overflow = "hidden";
    };
    const closeDrawer = () => { setDrawerOpen(false); setSelected(null); document.body.style.overflow = ""; };

    const openImage  = (src) => { setLightboxSrc(src); setImageLightboxOpen(true); document.body.style.overflow = "hidden"; };
    const closeImage = ()    => { setImageLightboxOpen(false); setLightboxSrc(null); document.body.style.overflow = ""; };

    const prevImage = (e) => { e?.stopPropagation(); setActiveImgIndex(i => (i - 1 + selected.images.length) % selected.images.length); };
    const nextImage = (e) => { e?.stopPropagation(); setActiveImgIndex(i => (i + 1) % selected.images.length); };

    const onMainTouchStart = (e) => { touchMoved.current = false; if (e.touches?.[0]) touchStartX.current = e.touches[0].clientX; };
    const onMainTouchMove  = ()    => { touchMoved.current = true; };
    const onMainTouchEnd   = (e)   => {
        if (!touchMoved.current || !touchStartX.current) return;
        const delta = e.changedTouches?.[0]?.clientX - touchStartX.current;
        if (Math.abs(delta) > 40) { if (delta < 0) nextImage(); else prevImage(); }
        touchStartX.current = null; touchMoved.current = false;
    };

    const formatDuration = (d) => {
        if (!d || Number.isNaN(d)) return "00:00";
        return `${Math.floor(d / 60)}:${Math.round(d % 60).toString().padStart(2, "0")}`;
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        const { error } = await supabase.from("products").delete().eq("id", deleteTarget.id);
        if (!error) {
            setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
            if (selected?.id === deleteTarget.id) closeDrawer();
        }
        setDeleteTarget(null); setDeleteLoading(false);
    };

    return (
        <div className="products-page-wrapper">
            <div className="products-page">
                <h2 className="page-title">Product Catalog</h2>

                <div className="kpi-grid">
                    <div className="kpi-card">
                        <div className="kpi-label">Total Models</div>
                        <div className="kpi-value">{products.length} items</div>
                    </div>
                </div>

                <div className="filter-bar">
                    <div className="search-box">
                        <FaSearch className="search-icon" />
                        <input placeholder="Search by name or product ID…" value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                    <div className="filter-controls">
                        <label>Filter by Category:</label>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {loading && <p style={{ textAlign: "center", padding: "2rem" }}>Loading products…</p>}
                {fetchError && (
                    <div className="fetch-error">
                        <FaExclamationTriangle /> {fetchError}
                        <button type="button" onClick={loadProducts} style={{ marginLeft: "1rem" }}>Retry</button>
                    </div>
                )}

                {!loading && !fetchError && (
                    <div className="table-shell">
                        <div className="table-scroll" style={{ overflowX: "auto" }}>
                            <table className="inventory-table" style={{ minWidth: 950 }}>
                                <thead>
                                    <tr>
                                        <th className="col-no">No.</th>
                                        <th className="col-info">Product Info</th>
                                        <th className="col-sku">Product ID</th>
                                        <th className="col-cat">Category</th>
                                        <th className="col-variants">Variants</th>
                                        <th className="col-action" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p, idx) => (
                                        <tr key={p.id} className="inventory-row" onClick={() => openDrawer(p)}>
                                            <td className="col-no">{idx + 1}</td>
                                            <td className="col-info">
                                                <div className="product-info">
                                                    {p.cover
                                                        ? <img src={p.cover} alt="cover" className="thumb" />
                                                        : <div className="thumb thumb-placeholder" />}
                                                    <div className="product-name">{p.name}</div>
                                                </div>
                                            </td>
                                            <td className="col-sku"><span className="sku-pill">{p.id}</span></td>
                                            <td className="col-cat">{p.category}</td>
                                            <td className="col-variants"><span className="variants-pill">{p.variations.length} Options</span></td>
                                            <td className="col-action">
                                                <button type="button" className="row-edit-btn" title="Edit"
                                                    onClick={e => { e.stopPropagation(); onEditProduct && onEditProduct(p); }}>
                                                    <FaPen />
                                                </button>
                                                <button type="button" className="row-delete-btn" title="Delete"
                                                    onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}>
                                                    <FaTrash />
                                                </button>
                                                <FaChevronRight className="row-chevron" />
                                            </td>
                                        </tr>
                                    ))}
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}>No products found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* DRAWER */}
                {drawerOpen && selected && (
                    <div className="drawer-overlay" onClick={closeDrawer}>
                        <div className="drawer" onClick={e => e.stopPropagation()}>
                            <div className="drawer-header">
                                <div>
                                    <div className="drawer-title">{selected.name}</div>
                                    <div className="drawer-meta">ID: {selected.id} · {selected.category}</div>
                                </div>
                            </div>
                            <div className="drawer-body">
                                {/* Gallery */}
                                <div className="gallery">
                                    <div className="gallery-stage"
                                        onClick={() => selected.images[activeImgIndex] && openImage(selected.images[activeImgIndex])}
                                        onTouchStart={onMainTouchStart} onTouchMove={onMainTouchMove} onTouchEnd={onMainTouchEnd}>
                                        {selected.images[activeImgIndex]
                                            ? <img src={selected.images[activeImgIndex]} alt={`image-${activeImgIndex}`} className="gallery-main-img" />
                                            : <div className="gallery-main-img gallery-no-image">No image</div>}
                                        <div className="gallery-badge">{activeImgIndex + 1} / {Math.max(selected.images.length, 1)}</div>
                                        {selected.images.length > 1 && (
                                            <>
                                                <button className="gallery-arrow prev" onClick={prevImage}><FaChevronLeft /></button>
                                                <button className="gallery-arrow next" onClick={nextImage}><FaChevronRight /></button>
                                            </>
                                        )}
                                    </div>
                                    <div className="thumb-strip" role="list">
                                        {selected.images.map((src, i) => (
                                            <button key={i} className={`thumb-item ${i === activeImgIndex ? "active" : ""}`}
                                                onClick={e => { e.stopPropagation(); setActiveImgIndex(i); }}>
                                                <img src={src} alt={`thumb-${i}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Video */}
                                {selected.video && (
                                    <div className="video-module">
                                        {inlineVideoExpanded ? (
                                            <div className="video-panel expanded">
                                                <div className="video-panel-header">
                                                    <div className="video-panel-status">
                                                        <span className="video-status-dot" />
                                                        <div>
                                                            <div className="video-panel-title">Product Video</div>
                                                            <div className="video-panel-subtitle">{isYouTubeUrl(selected.video) ? "YouTube embed" : "Direct video file"}</div>
                                                        </div>
                                                    </div>
                                                    <button className="video-panel-toggle" type="button" onClick={() => setInlineVideoExpanded(false)}>Minimize ✕</button>
                                                </div>
                                                <VideoPlayer src={selected.video} videoRef={videoRef}
                                                    onLoadedMetadata={() => { if (videoRef.current) setVideoDuration(videoRef.current.duration || 0); }}
                                                    className="video-player" />
                                            </div>
                                        ) : (
                                            <div className="video-panel collapsed">
                                                <div className="video-card-preview" onClick={() => setInlineVideoExpanded(true)}>
                                                    <div className="video-card-thumb"><FaPlay className="video-card-play" /></div>
                                                    <div className="video-card-info">
                                                        <div className="video-card-title">Watch Product Video</div>
                                                        <div className="video-card-subtitle">{isYouTubeUrl(selected.video) ? "YouTube" : formatDuration(videoDuration)}</div>
                                                    </div>
                                                </div>
                                                <div className="video-card-actions">
                                                    <button className="video-action-btn" type="button" onClick={() => setInlineVideoExpanded(true)}>Expand Video</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Description */}
                                <div className="description-block">
                                    {selected.description.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
                                </div>

                                {/* Variants */}
                                <div className="variations-list">
                                    <div className="variations-header">{selected.variantLabel} — {selected.variations.length} Options</div>
                                    <div className="variations-table">
                                        {selected.variations.map(v => (
                                            <div className="variation-row" key={v.id}>
                                                <div className="var-sku">{v.id}</div>
                                                <div className="var-label">{v.label}</div>
                                                <div className="var-price">{selected.hidePrice ? "—" : `₱${v.price}`}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="drawer-footer">
                                <button className="drawer-edit" onClick={() => { onEditProduct && onEditProduct(selected); closeDrawer(); }}>Edit Product</button>
                                <button className="drawer-delete" onClick={() => setDeleteTarget(selected)}>Delete</button>
                                <button className="drawer-close" onClick={closeDrawer}>Close</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* IMAGE LIGHTBOX */}
                {imageLightboxOpen && (
                    <div className="image-lightbox" onClick={closeImage}>
                        <div className="image-lightbox-panel" onClick={e => e.stopPropagation()}>
                            <button className="image-lightbox-close" type="button" onClick={closeImage}><FaTimes /></button>
                            <img src={lightboxSrc} alt="enlarged" className="image-lightbox-img" />
                        </div>
                    </div>
                )}

                {/* DELETE CONFIRMATION */}
                {deleteTarget && (
                    <div className="delete-confirm-overlay" onClick={() => !deleteLoading && setDeleteTarget(null)}>
                        <div className="delete-confirm-panel" onClick={e => e.stopPropagation()}>
                            <div className="delete-confirm-icon"><FaExclamationTriangle /></div>
                            <div className="delete-confirm-title">Delete Product?</div>
                            <div className="delete-confirm-body">
                                <strong>{deleteTarget.name}</strong> will be permanently removed along with all its variants and images. This cannot be undone.
                            </div>
                            <div className="delete-confirm-actions">
                                <button type="button" className="delete-cancel-btn" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</button>
                                <button type="button" className="delete-confirm-btn" onClick={confirmDelete} disabled={deleteLoading}>
                                    {deleteLoading ? "Deleting…" : "Yes, Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
