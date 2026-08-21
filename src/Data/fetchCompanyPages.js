// src/data/fetchCompanyPages.js
import { supabase } from "../lib/supabaseClient";

const PRODUCT_SELECT = `
  id,
  name,
  category_key,
  hide_price,
  video,
  description,
  sale_unit,
  variant_label,
  product_variants (
    id,
    label,
    price,
    sort_order
  ),
  product_images (
    filename,
    url,
    sort_order
  )
`;

function shapeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category_key,
    hidePrice: product.hide_price,
    video: product.video || null,
    description: product.description || "",
    saleUnit: product.sale_unit || "",
    variantLabel:
      product.variant_label || "Select Variant",

    variants: [...(product.product_variants || [])]
      .sort(
        (a, b) =>
          Number(a.sort_order) -
          Number(b.sort_order)
      )
      .map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: Number(variant.price || 0),
      })),

    images: [...(product.product_images || [])]
      .sort(
        (a, b) =>
          Number(a.sort_order) -
          Number(b.sort_order)
      )
      .map((image) => image.url || image.filename)
      .filter(Boolean),
  };
}

export async function fetchCompanyPages() {
  const { data: pages, error: pageError } =
    await supabase
      .from("company_pages")
      .select(
        `
          id,
          title,
          nav_label,
          slug,
          sort_order,
          updated_at
        `
      )
      .eq("is_published", true)
      .order("sort_order", {
        ascending: true,
      })
      .limit(5);

  if (pageError) {
    console.error(
      "fetchCompanyPages page error:",
      pageError.message
    );

    return [];
  }

  if (!pages?.length) {
    return [];
  }

  const pageIds = pages.map((page) => page.id);

  const { data: blocks, error: blockError } =
    await supabase
      .from("company_page_blocks")
      .select(
        `
          id,
          page_id,
          block_type,
          content,
          sort_order
        `
      )
      .in("page_id", pageIds)
      .order("sort_order", {
        ascending: true,
      });

  if (blockError) {
    console.error(
      "fetchCompanyPages block error:",
      blockError.message
    );

    return [];
  }

  const productBlocks = (blocks || []).filter(
    (block) => block.block_type === "products"
  );

  const productBlockIds = productBlocks.map(
    (block) => block.id
  );

  let productLinks = [];

  if (productBlockIds.length) {
    const { data, error } = await supabase
      .from("company_page_block_products")
      .select(
        `
          block_id,
          product_id,
          sort_order
        `
      )
      .in("block_id", productBlockIds)
      .order("sort_order", {
        ascending: true,
      });

    if (error) {
      console.error(
        "fetchCompanyPages product-link error:",
        error.message
      );

      return [];
    }

    productLinks = data || [];
  }

  const productIds = [
    ...new Set(
      productLinks.map((link) => link.product_id)
    ),
  ];

  let productMap = new Map();

  if (productIds.length) {
    const { data: products, error: productError } =
      await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .in("id", productIds);

    if (productError) {
      console.error(
        "fetchCompanyPages product error:",
        productError.message
      );

      return [];
    }

    productMap = new Map(
      (products || []).map((product) => {
        const shapedProduct = shapeProduct(product);

        return [
          shapedProduct.id,
          shapedProduct,
        ];
      })
    );
  }

  const linksByBlock = new Map();

  productLinks.forEach((link) => {
    if (!linksByBlock.has(link.block_id)) {
      linksByBlock.set(link.block_id, []);
    }

    linksByBlock
      .get(link.block_id)
      .push(link);
  });

  const blocksByPage = new Map();

  (blocks || []).forEach((block) => {
    if (!blocksByPage.has(block.page_id)) {
      blocksByPage.set(block.page_id, []);
    }

    const productsForBlock = (
      linksByBlock.get(block.id) || []
    )
      .sort(
        (a, b) =>
          Number(a.sort_order) -
          Number(b.sort_order)
      )
      .map((link) =>
        productMap.get(link.product_id)
      )
      .filter(Boolean);

    blocksByPage
      .get(block.page_id)
      .push({
        ...block,
        content: block.content || {},
        products: productsForBlock,
      });
  });

  return pages.map((page) => ({
    ...page,

    blocks: (
      blocksByPage.get(page.id) || []
    ).sort(
      (a, b) =>
        Number(a.sort_order) -
        Number(b.sort_order)
    ),
  }));
}