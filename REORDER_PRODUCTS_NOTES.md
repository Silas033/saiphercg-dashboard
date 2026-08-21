# Reorder Products implementation

## Supabase schema

No new table or column is required for this project. The feature uses the existing:

- `products.category_key`
- `products.sort_order`
- `categories.key`
- `categories.label`
- `categories.sort_order`

The dashboard reads products by category and saves zero-based `sort_order` values only for the selected category. The storefront already queries products by `sort_order`.

## Required permissions

The role used by the dashboard must be allowed to:

- `SELECT` from `categories`
- `SELECT` from `products`, `product_images`, and `product_variants`
- `UPDATE products.sort_order`

Do not grant unrestricted product updates to the public `anon` role on a production site. The recommended setup is authenticated admin users with an RLS policy that verifies an admin role stored in trusted app metadata or an admin profile table.

## Behavior included

- Only one selected category is shown at a time.
- Products can be reordered by drag-and-drop or arrow buttons.
- Unsaved changes are retained while switching between categories.
- Save affects only the active category.
- Failed multi-row saves attempt to restore rows already updated.
- New products are appended to the end of their selected category.
- Products moved to a different category are appended to the end of the new category.
