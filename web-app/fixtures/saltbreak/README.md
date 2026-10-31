# Saltbreak fixtures (synthetic)

Every image under `fixtures/saltbreak/<sku>/photo-1.jpg` is AI-generated
placeholder photography created for this fictional company. No real supplier,
product, or person is depicted. The `approvedImageRef` manifest field in each
supplier package points at these files; the same bytes are duplicated under
`apps/saltbreak/public/fixtures/` so the storefront can serve them.
