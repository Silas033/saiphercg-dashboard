// src/pages/ReorderProducts.jsx
// Reorders real Supabase products within one category at a time.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FaArrowDown,
    FaArrowUp,
    FaBoxOpen,
    FaExclamationTriangle,
    FaGripVertical,
    FaPen,
    FaPlus,
    FaSave,
    FaSyncAlt,
    FaTimes,
    FaTrashAlt,
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

function makeCategoryKey(label) {
    return String(label || "").replace(/[^a-zA-Z0-9]+/g, "");
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
    const initialCategoryOrderRef = useRef([]);
    const dragIndexRef = useRef(null);

    // Category management
    const [categoryOrderDirty, setCategoryOrderDirty] = useState(false);
    const [savingCategories, setSavingCategories] = useState(false);
    const catDragIndexRef = useRef(null);
    const [catDraggingKey, setCatDraggingKey] = useState(null);
    const [catOverIndex, setCatOverIndex] = useState(null);
    const [modal, setModal] = useState(null); // { type: "add" | "edit" | "delete", category? }
    const [modalLabel, setModalLabel] = useState("");
    const [modalMoveTo, setModalMoveTo] = useState("");
    const [modalBusy, setModalBusy] = useState(false);
    const [modalError, setModalError] = useState("");
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
                    virtual: true, // used by products but has no row in `categories` yet
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
        initialCategoryOrderRef.current = nextCategories.map((category) => category.key);
        setCategoryOrderDirty(false);
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


    // ── Category management ───────────────────────────────────

    const closeModal = () => {
        if (modalBusy) return;
        setModal(null);
        setModalError("");
    };

    const openAddCategory = () => {
        setModalLabel("");
        setModalMoveTo("");
        setModalError("");
        setModal({ type: "add" });
    };

    const openEditCategory = (category) => {
        setModalLabel(category.label);
        setModalMoveTo("");
        setModalError("");
        setModal({ type: "edit", category });
    };

    const openDeleteCategory = (category) => {
        const firstOther = categories.find((item) => item.key !== category.key);
        setModalLabel("");
        setModalMoveTo(firstOther?.key || "");
        setModalError("");
        setModal({ type: "delete", category });
    };

    const labelIsTaken = (label, exceptKey) => {
        const wanted = label.trim().toLowerCase();
        const wantedKey = makeCategoryKey(label).toLowerCase();
        return categories.some(
            (category) =>
                category.key !== exceptKey &&
                (category.label.trim().toLowerCase() === wanted ||
                    category.key.toLowerCase() === wantedKey)
        );
    };

    const submitAddCategory = async () => {
        const label = modalLabel.trim();
        const key = makeCategoryKey(label);

        if (!label || !key) {
            setModalError("Enter a category name (letters or numbers).");
            return;
        }
        if (labelIsTaken(label, null)) {
            setModalError("A category with this name already exists.");
            return;
        }

        setModalBusy(true);
        setModalError("");
        const nextOrder =
            Math.max(
                -1,
                ...categories
                    .filter((category) => !category.virtual)
                    .map((category) => Number(category.sort_order) || 0)
            ) + 1;

        const { data, error } = await supabase
            .from("categories")
            .insert({ key, label, sort_order: nextOrder })
            .select("key, label, sort_order")
            .single();

        setModalBusy(false);
        if (error || !data) {
            setModalError(error?.message || "The category could not be added.");
            return;
        }

        setCategories((previous) => [...previous, data]);
        setProductsByCategory((previous) => ({ ...previous, [data.key]: [] }));
        initialOrderRef.current[data.key] = [];
        initialCategoryOrderRef.current = [...initialCategoryOrderRef.current, data.key];
        setSelectedCategoryKey(data.key);
        setModal(null);
        showToast(`"${data.label}" category added.`);
    };

    const submitEditCategory = async () => {
        const category = modal?.category;
        const label = modalLabel.trim();
        if (!category) return;

        if (!label) {
            setModalError("The category name cannot be empty.");
            return;
        }
        if (labelIsTaken(label, category.key)) {
            setModalError("Another category already uses this name.");
            return;
        }
        if (label === category.label && !category.virtual) {
            setModal(null);
            return;
        }

        setModalBusy(true);
        setModalError("");

        // A category that only exists through its products has no row yet, so create it.
        const index = categories.findIndex((item) => item.key === category.key);
        const request = category.virtual
            ? supabase
                  .from("categories")
                  .upsert({ key: category.key, label, sort_order: index }, { onConflict: "key" })
            : supabase.from("categories").update({ label }).eq("key", category.key);

        const { data, error } = await request.select("key, label, sort_order").single();

        setModalBusy(false);
        if (error || !data) {
            setModalError(error?.message || "The category could not be updated.");
            return;
        }

        setCategories((previous) =>
            previous.map((item) => (item.key === data.key ? { ...data } : item))
        );
        setModal(null);
        showToast(`Category renamed to "${data.label}".`);
    };

    const submitDeleteCategory = async () => {
        const category = modal?.category;
        if (!category) return;

        const products = productsByCategory[category.key] || [];
        const target = categories.find((item) => item.key === modalMoveTo);

        if (products.length > 0 && !target) {
            setModalError("Choose a category to move this category's products into.");
            return;
        }

        setModalBusy(true);
        setModalError("");

        // 1) Move products first, so nothing is ever left without a category.
        let movedProducts = [];
        if (products.length > 0) {
            const targetProducts = productsByCategory[target.key] || [];
            const base =
                targetProducts.reduce(
                    (highest, product) => Math.max(highest, Number(product.sortOrder) || 0),
                    -1
                ) + 1;

            const moveResults = await Promise.all(
                products.map((product, index) =>
                    supabase
                        .from("products")
                        .update({ category_key: target.key, sort_order: base + index })
                        .eq("id", product.id)
                        .select("id")
                        .single()
                )
            );

            const failed = moveResults.find((result) => result.error || !result.data);
            if (failed) {
                // Put back any products that were already moved.
                await Promise.all(
                    moveResults.map((result, index) =>
                        !result.error && result.data
                            ? supabase
                                  .from("products")
                                  .update({
                                      category_key: category.key,
                                      sort_order: products[index].sortOrder,
                                  })
                                  .eq("id", products[index].id)
                            : null
                    )
                );
                setModalBusy(false);
                setModalError(
                    failed.error?.message || "The products could not be moved. Nothing was deleted."
                );
                return;
            }

            movedProducts = products.map((product, index) => ({
                ...product,
                categoryKey: target.key,
                sortOrder: base + index,
            }));
        }

        // 2) Delete the category row (nothing to delete if it never had one).
        if (!category.virtual) {
            const { error } = await supabase.from("categories").delete().eq("key", category.key);
            if (error) {
                setModalBusy(false);
                setModalError(
                    `${error.message} — products were moved to "${target?.label}"; reload to see the current state.`
                );
                return;
            }
        }

        // 3) Update local state without discarding unsaved product reorders.
        setProductsByCategory((previous) => {
            const next = { ...previous };
            delete next[category.key];
            if (target) next[target.key] = [...(previous[target.key] || []), ...movedProducts];
            return next;
        });
        if (target) {
            initialOrderRef.current[target.key] = [
                ...(initialOrderRef.current[target.key] || []),
                ...movedProducts.map((product) => product.id),
            ];
        }
        delete initialOrderRef.current[category.key];
        initialCategoryOrderRef.current = initialCategoryOrderRef.current.filter(
            (key) => key !== category.key
        );
        setDirtyCategories((previous) => {
            const next = new Set(previous);
            next.delete(category.key);
            return next;
        });
        const remaining = categories.filter((item) => item.key !== category.key);
        setCategories(remaining);
        setSelectedCategoryKey((current) =>
            current === category.key ? target?.key || remaining[0]?.key || "" : current
        );
        setModalBusy(false);
        setModal(null);
        showToast(
            movedProducts.length > 0
                ? `"${category.label}" deleted. ${movedProducts.length} product${movedProducts.length === 1 ? "" : "s"} moved to "${target.label}".`
                : `"${category.label}" deleted.`
        );
    };

    const moveCategory = (fromIndex, toIndex) => {
        if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= categories.length ||
            toIndex >= categories.length
        ) {
            return;
        }
        const next = [...categories];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        setCategories(next);
        setCategoryOrderDirty(
            next.map((category) => category.key).join("|") !==
                initialCategoryOrderRef.current.join("|")
        );
        setSaveError("");
    };

    const resetCategoryDrag = () => {
        catDragIndexRef.current = null;
        setCatDraggingKey(null);
        setCatOverIndex(null);
    };

    const handleCategoryDragStart = (event, index, key) => {
        catDragIndexRef.current = index;
        setCatDraggingKey(key);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
    };

    const handleCategoryDrop = (event, dropIndex) => {
        event.preventDefault();
        event.stopPropagation();
        const fromIndex = catDragIndexRef.current;
        if (fromIndex !== null) moveCategory(fromIndex, dropIndex);
        resetCategoryDrag();
    };

    const resetCategoryOrder = () => {
        const byKey = new Map(categories.map((category) => [category.key, category]));
        setCategories(initialCategoryOrderRef.current.map((key) => byKey.get(key)).filter(Boolean));
        setCategoryOrderDirty(false);
        setSaveError("");
    };

    const saveCategoryOrder = async () => {
        if (!categoryOrderDirty || savingCategories) return;
        setSavingCategories(true);
        setSaveError("");

        // One statement, so the whole order is saved or none of it is.
        const rows = categories.map((category, index) => ({
            key: category.key,
            label: category.label,
            sort_order: index,
        }));
        const { data, error } = await supabase
            .from("categories")
            .upsert(rows, { onConflict: "key" })
            .select("key");

        if (error || !data || data.length !== rows.length) {
            setSaveError(
                error?.message ||
                    "The category order could not be saved. Check the categories table INSERT/UPDATE policy."
            );
            setSavingCategories(false);
            return;
        }

        setCategories((previous) =>
            previous.map((category, index) => ({ ...category, sort_order: index, virtual: false }))
        );
        initialCategoryOrderRef.current = categories.map((category) => category.key);
        setCategoryOrderDirty(false);
        setSavingCategories(false);
        showToast("Category order saved.");
    };

    const modalCategory = modal?.category;
    const modalProductCount = modalCategory
        ? productsByCategory[modalCategory.key]?.length || 0
        : 0;
    const otherCategories = modalCategory
        ? categories.filter((category) => category.key !== modalCategory.key)
        : [];

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
                        <button type="button" className="retry-btn" onClick={openAddCategory}>
                            <FaPlus /> Add category
                        </button>
                    </div>
                ) : (
                    <div className="reorder-workspace">
                        <aside className="reorder-category-panel">
                            <div className="category-panel-heading">
                                <span>Categories</span>
                                <span className="category-heading-tools">
                                    <span className="category-total">{categories.length}</span>
                                    <button
                                        type="button"
                                        className="category-add-btn"
                                        onClick={openAddCategory}
                                        title="Add category"
                                        aria-label="Add category"
                                    >
                                        <FaPlus /> Add
                                    </button>
                                </span>
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
                                {categories.map((category, index) => {
                                    const isActive = category.key === selectedCategoryKey;
                                    const isDirty = dirtyCategories.has(category.key);
                                    const count = productsByCategory[category.key]?.length || 0;
                                    return (
                                        <div
                                            key={category.key}
                                            className={
                                                `category-option${isActive ? " active" : ""}` +
                                                `${catDraggingKey === category.key ? " dragging" : ""}` +
                                                `${catOverIndex === index && catDraggingKey && catDraggingKey !== category.key ? " drag-over" : ""}`
                                            }
                                            draggable={!savingCategories}
                                            onDragStart={(event) =>
                                                handleCategoryDragStart(event, index, category.key)
                                            }
                                            onDragEnter={() => {
                                                if (catDragIndexRef.current !== null) setCatOverIndex(index);
                                            }}
                                            onDragOver={(event) => {
                                                if (catDragIndexRef.current === null) return;
                                                event.preventDefault();
                                                event.dataTransfer.dropEffect = "move";
                                            }}
                                            onDrop={(event) => {
                                                if (catDragIndexRef.current === null) return;
                                                handleCategoryDrop(event, index);
                                            }}
                                            onDragEnd={resetCategoryDrag}
                                        >
                                            <span className="category-drag-handle" aria-hidden="true">
                                                <FaGripVertical />
                                            </span>
                                            <button
                                                type="button"
                                                className="category-option-main"
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
                                            <span className="category-row-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditCategory(category)}
                                                    title="Edit category"
                                                    aria-label={`Edit ${category.label}`}
                                                >
                                                    <FaPen />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="danger"
                                                    onClick={() => openDeleteCategory(category)}
                                                    title="Delete category"
                                                    aria-label={`Delete ${category.label}`}
                                                >
                                                    <FaTrashAlt />
                                                </button>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {categoryOrderDirty && (
                                <div className="category-order-bar">
                                    <span>Category order changed</span>
                                    <div>
                                        <button
                                            type="button"
                                            className="category-order-discard"
                                            onClick={resetCategoryOrder}
                                            disabled={savingCategories}
                                        >
                                            Discard
                                        </button>
                                        <button
                                            type="button"
                                            className="category-order-save"
                                            onClick={saveCategoryOrder}
                                            disabled={savingCategories}
                                        >
                                            {savingCategories ? "Saving…" : "Save order"}
                                        </button>
                                    </div>
                                </div>
                            )}
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
                                <div className="reorder-heading-side">
                                    <div className="mobile-category-actions">
                                        <button type="button" onClick={openAddCategory}>
                                            <FaPlus /> Add
                                        </button>
                                        <button type="button" onClick={() => activeCategory && openEditCategory(activeCategory)}>
                                            <FaPen /> Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => activeCategory && openDeleteCategory(activeCategory)}
                                        >
                                            <FaTrashAlt /> Delete
                                        </button>
                                    </div>
                                    <div className="drag-help">
                                        <FaGripVertical /> Drag rows or use the arrow buttons
                                    </div>
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

            {modal && (
                <div className="category-modal-backdrop" onMouseDown={closeModal}>
                    <div
                        className="category-modal"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="category-modal-header">
                            <h3>
                                {modal.type === "add" && "Add category"}
                                {modal.type === "edit" && "Edit category"}
                                {modal.type === "delete" && "Delete category"}
                            </h3>
                            <button type="button" onClick={closeModal} aria-label="Close" disabled={modalBusy}>
                                <FaTimes />
                            </button>
                        </div>

                        {modal.type !== "delete" ? (
                            <div className="category-modal-body">
                                <label>
                                    Category name
                                    <input
                                        type="text"
                                        value={modalLabel}
                                        autoFocus
                                        maxLength={60}
                                        placeholder="e.g. Shrink Wrap Film"
                                        onChange={(event) => setModalLabel(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                if (modal.type === "add") submitAddCategory();
                                                else submitEditCategory();
                                            }
                                        }}
                                    />
                                </label>
                                <p className="category-modal-hint">
                                    {modal.type === "add" ? (
                                        <>
                                            Internal key: <code>{makeCategoryKey(modalLabel) || "—"}</code>. It is
                                            generated from the name and cannot be changed later.
                                        </>
                                    ) : (
                                        <>
                                            Internal key <code>{modalCategory?.key}</code> stays the same, so
                                            products and storefront links keep working.
                                        </>
                                    )}
                                </p>
                            </div>
                        ) : (
                            <div className="category-modal-body">
                                <p>
                                    Delete <strong>{modalCategory?.label}</strong>? This cannot be undone.
                                </p>
                                {modalProductCount > 0 ? (
                                    otherCategories.length > 0 ? (
                                        <label>
                                            This category has {modalProductCount} product
                                            {modalProductCount === 1 ? "" : "s"}. Move them to:
                                            <select
                                                value={modalMoveTo}
                                                onChange={(event) => setModalMoveTo(event.target.value)}
                                            >
                                                {otherCategories.map((category) => (
                                                    <option key={category.key} value={category.key}>
                                                        {category.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    ) : (
                                        <p className="category-modal-hint">
                                            This is the only category and it still has products. Add another
                                            category first so the products have somewhere to go.
                                        </p>
                                    )
                                ) : (
                                    <p className="category-modal-hint">This category has no products.</p>
                                )}
                            </div>
                        )}

                        {modalError && (
                            <div className="category-modal-error">
                                <FaExclamationTriangle /> <span>{modalError}</span>
                            </div>
                        )}

                        <div className="category-modal-footer">
                            <button type="button" className="reorder-btn secondary" onClick={closeModal} disabled={modalBusy}>
                                Cancel
                            </button>
                            {modal.type === "add" && (
                                <button type="button" className="reorder-btn primary" onClick={submitAddCategory} disabled={modalBusy}>
                                    {modalBusy ? "Adding…" : "Add category"}
                                </button>
                            )}
                            {modal.type === "edit" && (
                                <button type="button" className="reorder-btn primary" onClick={submitEditCategory} disabled={modalBusy}>
                                    {modalBusy ? "Saving…" : "Save changes"}
                                </button>
                            )}
                            {modal.type === "delete" && (
                                <button
                                    type="button"
                                    className="reorder-btn danger"
                                    onClick={submitDeleteCategory}
                                    disabled={modalBusy || (modalProductCount > 0 && otherCategories.length === 0)}
                                >
                                    {modalBusy
                                        ? "Deleting…"
                                        : modalProductCount > 0
                                          ? "Move products & delete"
                                          : "Delete category"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
