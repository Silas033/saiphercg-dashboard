// src/pages/ReorderProducts.jsx
// Reorders real Supabase products within one category at a time.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FaArrowDown,
    FaArrowUp,
    FaBoxOpen,
    FaExclamationTriangle,
    FaGripVertical,
    FaSave,
    FaSyncAlt,
    FaUndo,
} from "react-icons/fa";
import { supabase } from "../lib/supabaseClient";
import "../styles/reorder.css";

const PRODUCT_SELECT = `
    id,
    name,
    category_key,
    hide_price,
    sort_order,
    product_variants ( price, sort_order ),
    product_images ( filename, url, sort_order )
`;

function humanizeCategoryKey(key) {
    return String(key || "Uncategorized")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shapeProduct(product, fallbackOrder) {
    const images = [...(product.product_images || [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const variants = [...(product.product_variants || [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const prices = variants
        .map((variant) => Number(variant.price))
        .filter(Number.isFinite);

    return {
        id: product.id,
        name: product.name,
        categoryKey: product.category_key,
        hidePrice: Boolean(product.hide_price),
        sortOrder: Number.isFinite(Number(product.sort_order))
            ? Number(product.sort_order)
            : fallbackOrder,
        image: images[0]?.url || images[0]?.filename || "",
        startingPrice:
            product.hide_price || prices.length === 0 || prices.every((price) => price === 0)
                ? null
                : Math.min(...prices),
    };
}

export default function ReorderProducts() {
    const [categories, setCategories] = useState([]);
    const [productsByCategory, setProductsByCategory] = useState({});
    const [selectedCategoryKey, setSelectedCategoryKey] = useState("");
    const [dirtyCategories, setDirtyCategories] = useState(() => new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [toast, setToast] = useState("");

    const initialOrderRef = useRef({});
    const dragIndexRef = useRef(null);
    const [draggingId, setDraggingId] = useState(null);
    const [overIndex, setOverIndex] = useState(null);
    const toastTimerRef = useRef(null);

    const showToast = useCallback((message) => {
        setToast(message);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(""), 2600);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        setSaveError("");

        const [categoryResult, productResult] = await Promise.all([
            supabase
                .from("categories")
                .select("key, label, sort_order")
                .order("sort_order", { ascending: true })
                .order("label", { ascending: true }),
            supabase
                .from("products")
                .select(PRODUCT_SELECT)
                .order("category_key", { ascending: true })
                .order("sort_order", { ascending: true })
                .order("id", { ascending: true }),
        ]);

        if (categoryResult.error || productResult.error) {
            setLoadError(
                categoryResult.error?.message ||
                productResult.error?.message ||
                "Unable to load products."
            );
            setLoading(false);
            return;
        }

        const categoryMap = new Map(
            (categoryResult.data || []).map((category) => [category.key, category])
        );

        (productResult.data || []).forEach((product) => {
            if (!categoryMap.has(product.category_key)) {
                categoryMap.set(product.category_key, {
                    key: product.category_key,
                    label: humanizeCategoryKey(product.category_key),
                    sort_order: Number.MAX_SAFE_INTEGER,
                });
            }
        });

        const nextCategories = [...categoryMap.values()].sort((a, b) => {
            const orderDifference = (a.sort_order ?? 0) - (b.sort_order ?? 0);
            return orderDifference || a.label.localeCompare(b.label);
        });

        const nextGroups = Object.fromEntries(
            nextCategories.map((category) => [category.key, []])
        );

        (productResult.data || []).forEach((product) => {
            const categoryProducts = nextGroups[product.category_key] || [];
            categoryProducts.push(shapeProduct(product, categoryProducts.length));
            nextGroups[product.category_key] = categoryProducts;
        });

        const nextInitialOrders = {};
        Object.entries(nextGroups).forEach(([categoryKey, products]) => {
            nextInitialOrders[categoryKey] = products.map((product) => product.id);
        });

        initialOrderRef.current = nextInitialOrders;
        setCategories(nextCategories);
        setProductsByCategory(nextGroups);
        setDirtyCategories(new Set());
        setSelectedCategoryKey((current) =>
            nextCategories.some((category) => category.key === current)
                ? current
                : nextCategories[0]?.key || ""
        );
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, [loadData]);

    const activeCategory = useMemo(
        () => categories.find((category) => category.key === selectedCategoryKey),
        [categories, selectedCategoryKey]
    );

    const activeProducts = productsByCategory[selectedCategoryKey] || [];
    const activeIsDirty = dirtyCategories.has(selectedCategoryKey);

    const resetDragState = () => {
        dragIndexRef.current = null;
        setDraggingId(null);
        setOverIndex(null);
    };

    const updateActiveProducts = (updater) => {
        setProductsByCategory((previous) => ({
            ...previous,
            [selectedCategoryKey]: updater(previous[selectedCategoryKey] || []),
        }));
        setDirtyCategories((previous) => {
            const next = new Set(previous);
            next.add(selectedCategoryKey);
            return next;
        });
        setSaveError("");
    };

    const moveProduct = (fromIndex, toIndex) => {
        if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= activeProducts.length ||
            toIndex >= activeProducts.length
        ) {
            return;
        }

        updateActiveProducts((products) => {
            const next = [...products];
            const [movedProduct] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, movedProduct);
            return next;
        });
    };

    const handleDragStart = (event, index, productId) => {
        dragIndexRef.current = index;
        setDraggingId(productId);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", productId);
    };

    const handleDrop = (event, dropIndex) => {
        event.preventDefault();
        const fromIndex = dragIndexRef.current;
        if (fromIndex !== null) moveProduct(fromIndex, dropIndex);
        resetDragState();
    };

    const resetOrder = () => {
        const savedIds = initialOrderRef.current[selectedCategoryKey] || [];
        updateActiveProducts((products) => {
            const productMap = new Map(products.map((product) => [product.id, product]));
            return savedIds.map((id) => productMap.get(id)).filter(Boolean);
        });
        setDirtyCategories((previous) => {
            const next = new Set(previous);
            next.delete(selectedCategoryKey);
            return next;
        });
        setSaveError("");
    };

    const saveOrder = async () => {
        if (!selectedCategoryKey || !activeIsDirty || saving) return;

        setSaving(true);
        setSaveError("");
        const originalOrders = new Map(
            activeProducts.map((product) => [product.id, product.sortOrder])
        );

        const results = await Promise.all(
            activeProducts.map((product, index) =>
                supabase
                    .from("products")
                    .update({ sort_order: index })
                    .eq("id", product.id)
                    .eq("category_key", selectedCategoryKey)
                    .select("id")
                    .single()
            )
        );

        const failedUpdates = results
            .map((result, index) => ({ ...result, index }))
            .filter((result) => result.error || !result.data);

        if (failedUpdates.length > 0) {
            const successfulUpdates = results
                .map((result, index) => ({ ...result, index }))
                .filter((result) => !result.error && result.data);

            await Promise.all(
                successfulUpdates.map(({ index }) => {
                    const product = activeProducts[index];
                    return supabase
                        .from("products")
                        .update({ sort_order: originalOrders.get(product.id) })
                        .eq("id", product.id)
                        .eq("category_key", selectedCategoryKey);
                })
            );

            setSaveError(
                failedUpdates[0].error?.message ||
                "The order could not be saved. Check the products table UPDATE policy."
            );
            setSaving(false);
            return;
        }

        const savedProducts = activeProducts.map((product, index) => ({
            ...product,
            sortOrder: index,
        }));

        setProductsByCategory((previous) => ({
            ...previous,
            [selectedCategoryKey]: savedProducts,
        }));
        initialOrderRef.current[selectedCategoryKey] = savedProducts.map(
            (product) => product.id
        );
        setDirtyCategories((previous) => {
            const next = new Set(previous);
            next.delete(selectedCategoryKey);
            return next;
        });
        setSaving(false);
        showToast(`${activeCategory?.label || "Category"} order saved.`);
    };

    return (
        <div className="reorder-page-wrapper">
            <div className="reorder-page">
                <div className="reorder-header">
                    <div>
                        <p className="reorder-eyebrow">PRODUCT MANAGEMENT</p>
                        <h2 className="page-title">Reorder Products</h2>
                        <p className="reorder-subtitle">
                            Choose a category, then drag products into the exact order customers
                            should see on the storefront.
                        </p>
                    </div>

                    <div className="reorder-actions">
                        <button
                            type="button"
                            className="reorder-btn secondary"
                            onClick={resetOrder}
                            disabled={!activeIsDirty || saving}
                        >
                            <FaUndo /> Reset
                        </button>
                        <button
                            type="button"
                            className="reorder-btn primary"
                            onClick={saveOrder}
                            disabled={!activeIsDirty || saving}
                        >
                            {saving ? <FaSyncAlt className="spin" /> : <FaSave />}
                            {saving ? "Saving…" : "Save Order"}
                        </button>
                    </div>
                </div>

                {toast && <div className="reorder-toast success">{toast}</div>}
                {saveError && (
                    <div className="reorder-toast error">
                        <FaExclamationTriangle />
                        <span>{saveError}</span>
                    </div>
                )}

                {loading ? (
                    <div className="reorder-state-card">
                        <FaSyncAlt className="spin" /> Loading categories and products…
                    </div>
                ) : loadError ? (
                    <div className="reorder-state-card error-state">
                        <FaExclamationTriangle />
                        <div>
                            <strong>Products could not be loaded.</strong>
                            <p>{loadError}</p>
                        </div>
                        <button type="button" className="retry-btn" onClick={loadData}>
                            Try again
                        </button>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="reorder-state-card">
                        <FaBoxOpen /> No categories are available yet.
                    </div>
                ) : (
                    <div className="reorder-workspace">
                        <aside className="reorder-category-panel">
                            <div className="category-panel-heading">
                                <span>Categories</span>
                                <span>{categories.length}</span>
                            </div>

                            <label className="mobile-category-select">
                                <span>Select category</span>
                                <select
                                    value={selectedCategoryKey}
                                    onChange={(event) => {
                                        resetDragState();
                                        setSelectedCategoryKey(event.target.value);
                                        setSaveError("");
                                    }}
                                >
                                    {categories.map((category) => (
                                        <option key={category.key} value={category.key}>
                                            {category.label} ({productsByCategory[category.key]?.length || 0})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="desktop-category-list">
                                {categories.map((category) => {
                                    const isActive = category.key === selectedCategoryKey;
                                    const isDirty = dirtyCategories.has(category.key);
                                    const count = productsByCategory[category.key]?.length || 0;
                                    return (
                                        <button
                                            key={category.key}
                                            type="button"
                                            className={`category-option${isActive ? " active" : ""}`}
                                            onClick={() => {
                                                resetDragState();
                                                setSelectedCategoryKey(category.key);
                                                setSaveError("");
                                            }}
                                        >
                                            <span className="category-option-copy">
                                                <span className="category-option-label">
                                                    {category.label}
                                                    {isDirty && <span className="unsaved-dot" title="Unsaved changes" />}
                                                </span>
                                                <span className="category-option-key">{category.key}</span>
                                            </span>
                                            <span className="category-count">{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <section className="reorder-list-panel">
                            <div className="reorder-list-heading">
                                <div>
                                    <p className="selected-category-label">Selected category</p>
                                    <h3>{activeCategory?.label}</h3>
                                    <p>
                                        {activeProducts.length} product{activeProducts.length === 1 ? "" : "s"}
                                        {activeIsDirty && <span className="unsaved-label">Unsaved changes</span>}
                                    </p>
                                </div>
                                <div className="drag-help">
                                    <FaGripVertical /> Drag rows or use the arrow buttons
                                </div>
                            </div>

                            {activeProducts.length === 0 ? (
                                <div className="empty-category-state">
                                    <FaBoxOpen />
                                    <strong>No products in this category</strong>
                                    <p>Add a product to this category before arranging its order.</p>
                                </div>
                            ) : (
                                <div className="reorder-list" role="list">
                                    {activeProducts.map((product, index) => (
                                        <article
                                            key={product.id}
                                            role="listitem"
                                            className={
                                                `reorder-row${draggingId === product.id ? " dragging" : ""}` +
                                                `${overIndex === index && draggingId !== product.id ? " drag-over" : ""}`
                                            }
                                            draggable={!saving}
                                            onDragStart={(event) => handleDragStart(event, index, product.id)}
                                            onDragEnter={() => setOverIndex(index)}
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                                event.dataTransfer.dropEffect = "move";
                                            }}
                                            onDrop={(event) => handleDrop(event, index)}
                                            onDragEnd={resetDragState}
                                        >
                                            <div className="row-position">{index + 1}</div>
                                            <div className="row-drag-handle" aria-hidden="true">
                                                <FaGripVertical />
                                            </div>

                                            {product.image ? (
                                                <img
                                                    src={product.image}
                                                    alt=""
                                                    className="reorder-product-thumb"
                                                    draggable="false"
                                                />
                                            ) : (
                                                <div className="reorder-product-thumb thumb-placeholder">
                                                    <FaBoxOpen />
                                                </div>
                                            )}

                                            <div className="reorder-product-copy">
                                                <strong>{product.name}</strong>
                                                <span>{product.id}</span>
                                            </div>

                                            <div className="reorder-price">
                                                {product.startingPrice === null
                                                    ? "No price shown"
                                                    : `From ₱${product.startingPrice.toLocaleString()}`}
                                            </div>

                                            <div className="reorder-row-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => moveProduct(index, index - 1)}
                                                    disabled={index === 0 || saving}
                                                    aria-label={`Move ${product.name} earlier`}
                                                    title="Move earlier"
                                                >
                                                    <FaArrowUp />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveProduct(index, index + 1)}
                                                    disabled={index === activeProducts.length - 1 || saving}
                                                    aria-label={`Move ${product.name} later`}
                                                    title="Move later"
                                                >
                                                    <FaArrowDown />
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
