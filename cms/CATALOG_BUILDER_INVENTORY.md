# Catalog Builder Feature Inventory

Products studied: Flipsnack, Catalog Machine, Catalogly
Pulled: October 7, 2026, from public pricing pages, feature pages and help centers
Purpose: a deduplicated feature list to build from. Everything is described in our own words. Do not copy their text, templates or visual design.

## How to read this file

* F = Flipsnack, CM = Catalog Machine, CL = Catalogly
* Y = documented on their public pages. Blank = not found in what was pulled, which is not proof they lack it.
* Tier = the lowest plan where the feature appears, when the source says. A feature locked to a high tier is one they believe customers pay for.
* Section 3 lists table stakes (all three have it). Section 4 lists differentiators (only one has it).
* Section 7 lists what could not be verified. Read it before relying on any single row.

## 1. What each product is

| | Flipsnack | Catalog Machine | Catalogly |
|---|---|---|---|
| Core idea | Turn a PDF or a design into an interactive flipbook | Product database first, catalogs generated from it | Store or spreadsheet products poured into fixed layouts |
| Starting point | Upload PDF, or design from scratch in an editor | Import products, then design pages around them | Connect Shopify or import CSV, pick a layout |
| Main outputs | Hosted flipbook, PDF, images, video, HTML5 | Online catalog, PDF, searchable showroom | Print PDF, line sheet, hosted flipbook |
| Strongest area | Interactivity, sharing controls, analytics, branding | Product data model, pricing tiers, ordering, automation | Print quality, speed to first catalog, Shopify sync |
| Weakest area | Product data sync is Enterprise only | Dated feel per reviews, prices hidden behind script | Narrow feature set, Shopify centric |
| Free tier | 5 flipbooks, 15 pages each, watermark | 15 day trial, 20 products, 2 catalogs, 10 pages | 2 catalogs, 5 pages each |
| Paid ladder | Starter 35, Pro 52, Business 109 per month, Enterprise custom | Lite, Pro, Premium (prices not captured) | Pro 9.99, Advanced 19.99, Unlimited 49.99 per month |

## 2. Feature matrix

### 2.1 Product data and import

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Central product database | One record per product feeds every catalog | | Y | Y | CM core concept |
| Custom fields per category | Each product type gets its own attribute set | | Y | | |
| Categories | Group products that share the same fields | | Y | | |
| Collections | Flexible, nested groupings used to fill pages | | Y | Y | CL uses Shopify collections |
| Manual add and quick edit | Create and edit products in a grid | | Y | | CM expands a row to edit variants inline |
| CSV and Excel import | Bulk load products from a spreadsheet | Y | Y | Y | F calls it a product feed, Enterprise |
| Google Sheets or Docs import | Pull products from a live sheet | | Y | | |
| Import from a web page URL | Paste a product page, products are extracted | Y | Y | | F Enterprise, CM via AI |
| Store sync: Shopify | Products, variants, images, prices come across | | Y | Y | |
| Store sync: Etsy, eBay, WooCommerce, Magento, PrestaShop | Same, other platforms | | Y | | |
| Metafield support | Custom store fields usable in layouts | | Y | Y | CL on all plans |
| PDF import as pages | Existing PDF becomes the catalog pages | Y | Y | Y | CL imports pages only, no data extraction |
| PDF import with data extraction | Products recognized inside an uploaded PDF | Y | Y | | F by SKU detection, CM via AI |
| SKU detection | Finds SKUs on a page and links them to products | Y | | | F, also works on InDesign exports |
| Barcodes on products | Store and print barcodes | | Y | Y | |
| Image library | Upload, folder, crop, resize, reuse images | Y | Y | | |
| Image import from Drive, Dropbox, web | Bring images in without downloading first | | Y | | |
| Create products from images | Drop photos, get product records | | Y | | |
| Stock photo and video library | Free stock media inside the editor | Y | | | Pexels and Pixabay |
| Hosted images for feeds | Host the images a CSV points to | Y | | | |

### 2.2 Pricing and variants

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Variants with options | Size, color, material combinations | Y | Y | Y | F via variant feed |
| Per variant price, SKU, image, barcode, stock | Each variant carries its own values | | Y | | CM all plans |
| Variant display modes | List each with price, show a range, collapse to one line | | Y | | |
| Tiered price levels | Wholesale, retail, distributor in one database | | Y | Y | |
| Wholesale discount by percent | Derive wholesale from retail | | | Y | |
| Price override per catalog | Change a price in one catalog only | | | Y | |
| Price import by CSV | Update prices in bulk | | Y | Y | |
| Calculated fields | Formulas compute a displayed value | | Y | | CM calls them expressions |
| Compare at price | Show a crossed out original price | | | Y | |
| Currency format and rounding | Control symbol, decimals, rounding | | | Y | |
| Show or hide prices | Same catalog with and without pricing | | Y | | CM order form setting |

### 2.3 Inventory

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Stock quantity per product and variant | Track counts | | Y | Y | CL reads from Shopify |
| Show stock in layouts | Print quantity or status on the page | | Y | Y | |
| In stock filter | Hide what cannot be ordered | | Y | | |
| Stock check at order time | Blocks overselling, deducts on payment | | Y | | |
| Out of stock hidden automatically | No manual cleanup | | Y | | |

### 2.4 Catalog editor

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Drag and drop page builder | Place elements freely | Y | Y | Y | |
| Zoom in and out | Work at page or detail level | | | Y | |
| Drag products into placeholders | Fill a layout by dropping products | | Y | Y | |
| Add many products at once | Bulk fill pages | | Y | Y | |
| Edit in place | Click text or product on the page to change it | Y | Y | | |
| Edit an uploaded PDF | Change text, shapes, images after upload | Y | | | Beta, free plan |
| Pages panel | Reorder, duplicate, delete, replace pages | Y | Y | | |
| Bulk delete pages | Remove many pages at once | Y | | | |
| Double page spreads | Design across two facing pages | Y | | | |
| Resize the whole document | Change page dimensions after the fact | Y | | | |
| Master layer | One element repeated on every page | Y | | | |
| Headers and footers | Repeating top and bottom content | Y | Y | Y | |
| Automatic page numbers | | Y | | | |
| Table of contents | Generated from sections | Y | Y | Y | CM keeps it in sync automatically |
| Product index | Alphabetical or SKU index at the back | | Y | | |
| Rulers, guides, smart guides | Alignment aids | Y | | | |
| Arrange, align, tidy up, group | Layout helpers | Y | | | |
| Layers with names | Stack and label elements | Y | | | |
| Clipping masks | Crop images into shapes | Y | | | |
| Image filters and enhance | Basic photo adjustments | Y | | | |
| Text styles and per character formatting | | Y | Y | | |
| Tables | Insert and style a table | Y | Y | | |
| Undo, redo | | Y | | | |
| Version history | Restore an earlier state | Y | | | |
| Right click menu | | Y | | | |
| Keyboard shortcuts | | Y | | | |
| Notes on pages | Internal notes that do not publish | Y | | | |
| Comments for team review | Threaded feedback inside the editor | Y | | | |
| Copy elements between catalogs | Reuse a block elsewhere | Y | | | |
| Custom CSS | Full style control for advanced users | | | Y | |
| Dynamic placeholders | A value defined once, updated everywhere | | Y | | CM calls them parameters |

### 2.5 Layouts, templates and catalog types

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Ready made templates | Start from a designed catalog | Y | Y | Y | CM 50 plus, CL 35 plus layouts |
| Products per page presets | 1, 3, 4, 6, 10, 12, 15 per page | | Y | Y | |
| Automatic product grid | Generates as many pages as the collection needs | | Y | Y | CM AutoGrid |
| Product card template | Reusable design for one product block | | Y | | |
| Tabular price list | Rows of products with columns you choose | | Y | Y | |
| Line sheet | Compact wholesale layout with SKU and both prices | | Y | Y | |
| Spec or data sheet | One product, full attributes | | Y | | |
| Order form layout | Price list with quantity entry | | Y | | |
| Lookbook | Image led, few words | | Y | Y | |
| Label sheets | Print product labels | | | Y | |
| Save my own templates | | Y | Y | | F free plan |
| Template folders | | Y | | | |
| Locked templates | Team can fill but not break the brand | Y | | | |
| Lock individual elements | | Y | | | |
| Share templates with team | | Y | Y | | |
| Mix layouts in one catalog | Cover, grid, list, spec pages together | Y | Y | Y | |
| Master catalog | One catalog assembled from other catalogs | | Y | | |
| Clone a catalog | Duplicate as a starting point | | Y | | F can save a catalog as a template |

### 2.6 Automation and sync

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| One click refresh | Pull current prices and details into an existing catalog | Y | Y | Y | F Enterprise, CL all plans |
| Automatic update on product change | Catalogs rebuild without being asked | | Y | | |
| Scheduled updates | Refresh on a timer | | Y | Y | CL Advanced 19.99 and up |
| Include and exclude rules | Products enter or leave by rule | | Y | Y | |
| Collection filter and sort | Control order and membership per catalog | | Y | Y | |
| Catalog generator from feed and template | Feed plus template yields a full catalog | Y | Y | Y | F Enterprise |
| Automate media | Feed drives videos and images, not only text | Y | | | |
| Many catalogs from one database | Per buyer, season, market | | Y | Y | |

### 2.7 AI

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Build a catalog from a conversation | Describe products, get products and a catalog | | Y | | Credit based |
| AI import from CSV, URL, image, PDF | Messy input turned into structured products | | Y | | |
| AI picks a template | | | Y | | |
| Free in app help assistant | Answers how to questions | | Y | | |
| Image generation | Text prompt to image | Y | | | Credits |
| Translate a catalog | Whole document or selected text | Y | | | |
| Alt text generation | For accessibility | Y | | | |
| Page summaries and text extraction | Makes pages readable by screen readers | Y | | | |
| Animate a still image | | Y | | | |
| Monthly credit allowance by plan | Usage metered, resets monthly | Y | Y | | F 100 to 500, CM 20 to 100 dollars of credit |

### 2.8 Interactive content inside the catalog

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Links, internal and external | | Y | | Y | F Starter |
| Links detected from the PDF | URLs, emails, phones become clickable | Y | | | F free plan |
| Tap to call | | Y | | | |
| Product tag | Hotspot on a product opening details | Y | | Y | F Pro |
| Click through to store product page | | Y | | Y | |
| Video: YouTube, Vimeo, uploaded | | Y | | | F Pro |
| Video settings | Autoplay, mute, loop | Y | | | |
| Audio and background music | | Y | | | F Pro |
| Photo slideshow | | Y | | | F Pro |
| GIFs | | Y | | | |
| Popups | Extra content in an overlay | Y | | | |
| Charts | | Y | Y | | F Pro |
| Embedded outside content | Any iframe | Y | | | |
| Motion effects | Elements animate on page turn | Y | | | |
| Spotlight | Dim the page, highlight one image | Y | | | F Pro |
| Captions and tags | | Y | | | F Pro |
| Lead form | Gate content behind contact details | Y | Y | | F Pro, CM email privacy level on Pro |
| Contact form in page | | Y | | | |
| Quiz and question boxes | | Y | | | |
| QR codes on pages | | | | Y | CL all plans |
| Scannable barcode on page | | Y | Y | Y | |

### 2.9 Viewer experience

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Page flip view | Book style page turn | Y | Y | Y | |
| Single page scroll view | Best on phones | Y | | Y | |
| Carousel view | Several pages side by side | | | Y | |
| Smart view | Picks single or double by screen | Y | | | |
| Works on phone and tablet | | Y | Y | Y | |
| Nothing to install | Opens from a link | Y | Y | Y | |
| Text search inside the catalog | | Y | Y | | CM in showroom |
| Page thumbnails overview | Jump to any page | Y | | | |
| Reader notes | Viewer keeps private notes | Y | | | |
| Page flip sound | | Y | | | |
| Right to left reading | | Y | | | F free plan |
| Player skins and control choices | Decide which buttons viewers see | Y | | | |
| Player language | | Y | | | |
| Offline viewing on phone | | Y | | | |
| Crisp vector text | Text stays sharp at any zoom | Y | | | F free plan |

### 2.10 Publishing, privacy and access

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Draft and published states | | Y | Y | Y | |
| Public | Listed and indexed by search engines | Y | Y | | |
| Unlisted or direct link | Anyone with the link | Y | Y | Y | F Starter |
| Hidden from search and public list | | Y | Y | | |
| Password | | Y | Y | Y | F Pro, CM Pro |
| Email required to view | | Y | Y | | CM Pro |
| Specific people only | Named viewers | Y | | | F Business |
| One time passcode | Code sent to the viewer each visit | Y | | | |
| Reader groups | Manage viewers as groups | Y | | | |
| Read only workspace members | | Y | | | F add on |
| Leak protection watermark | Viewer identity stamped on pages | Y | | | |
| Domain restriction for embeds | Only approved sites can embed | Y | | | |
| Schedule publish and unpublish | | Y | | | F Business |
| Deactivate without deleting | | Y | | | |
| Edit and republish at the same link | | Y | Y | Y | See conflict note for CL |
| Replace the PDF and keep the link | | Y | | | |
| Custom link name | | Y | | | |
| Choose the displayed publication date | | Y | | | |
| Paid access and subscriptions | Sell the publication itself | Y | | | |

### 2.11 Output and print

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| PDF export | | Y | Y | Y | F free with watermark |
| Web and print quality options | | Y | | Y | CL 150 DPI, 300 DPI, prepress |
| Print bleed | Extra margin for trimming | | | Y | 5 mm |
| Page sizes | A4, A5, Letter, Half Letter, both orientations | Y | Y | Y | |
| Social formats | 4:5, 9:16, 1:1 | | | Y | |
| Ink saving PDF | Drop background colors on print | | Y | | |
| Fit design to PDF page | Fixes screen to print mismatch | | Y | | |
| Accessible PDF | Tagged for screen readers | Y | | | |
| Images: JPG, PNG | | Y | | | |
| GIF and MP4 | Animated preview for social | Y | | | |
| HTML5 package | Host it on your own server | Y | Y | | F Business. CM lists HTML output, self hosting unconfirmed |
| High resolution images | | | Y | Y | CM paid, CL Pro 9.99 |
| Premium fonts | | | Y | Y | CL Google Fonts |
| Viewer PDF download toggle | Allow or block downloads | Y | Y | | |

### 2.12 Sharing and embedding

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Hosted link | | Y | Y | Y | |
| Embed on a website | | Y | Y | Y | F watermark below Pro |
| QR code for the catalog | | Y | | Y | F Starter, can be branded |
| Social sharing | | Y | Y | Y | |
| Send by email | | Y | Y | Y | |
| Email platform hookups | Mailchimp, HubSpot, Constant Contact, Mailjet | Y | | | |
| Bookshelf | One page presenting many catalogs | Y | Y | | F Pro, CM public catalog list |
| Public profile page | | Y | Y | | |
| Custom domain | | Y | | | |
| Individually trackable links | A separate link per recipient | Y | | | F Pro 50, Business 200 |
| Customize emails sent to viewers | | Y | Y | | |

### 2.13 Ordering and payments

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Add to list or cart from the catalog | | Y | Y | Y | F Pro |
| Variant selection while ordering | | | Y | Y | |
| Order request or quote | Submit without paying | Y | Y | Y | CL creates a Shopify draft order |
| Online payment | | | Y | Y | CM Stripe, CL Shopify checkout |
| Both modes at once | | | Y | | |
| WhatsApp checkout | Order sent as a message | Y | | | |
| Configurable order form | Fields, required, layout, button text | Y | Y | | |
| Custom customer fields | Text, long text, dropdown | | Y | | |
| Sales tax | Default rate, override per order | | Y | | |
| Flat rate shipping and fees | | | Y | | |
| Order dashboard | Search and filter by customer, product, status, date | | Y | | |
| Status workflow | New, accepted, rejected, closed | | Y | | |
| Quick actions from the list | Accept, reject, close, delete | | Y | | |
| Edit an order | Change items, quantities, prices | | Y | | |
| Manual order entry | For phone and email orders | | Y | | |
| Order history trail | Every change recorded | | Y | | |
| Internal notes on orders | | | Y | | |
| New order alert to the business | | Y | Y | | |
| Confirmation to the customer | | Y | Y | | |
| Editable order emails | Change what the confirmation says | Y | Y | | CM adds merge fields and an HTML editor with live preview |
| Resend emails | | | Y | | |
| Export orders to CSV | | | Y | | |
| Import orders from CSV | Bulk edit round trip | | Y | | |
| Order statistics | | Y | | | |
| Orders through API | | | Y | | |

### 2.14 Online showroom

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Searchable product site generated from the database | | | Y | | |
| Browse by category | | | Y | | |
| Featured products | | | Y | | |
| Individual product pages | | | Y | | |
| Select products, download as PDF | Buyer builds their own mini catalog | | Y | | |
| Select products, request a quote | | | Y | | |
| Several showrooms | One per audience | | Y | | Pro |
| Showroom privacy | Same levels as catalogs, plus fully closed | | Y | | |

### 2.15 Analytics

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Views over time | | Y | Y | | F Pro |
| Per page statistics | | | Y | | |
| Click tracking | Which products and links get clicked | | | Y | |
| Source breakdown | Location, referrer, social, browser | | Y | | |
| Per reader statistics | Who viewed what | Y | | | |
| Per recipient link tracking | | Y | | | |
| Google Analytics | | Y | | | F Pro |
| Google Tag Manager | | Y | | | Enterprise |
| Export statistics to CSV | | Y | | | |
| Team usage report | | Y | | | |

### 2.16 Branding

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Logo, colors, fonts | | Y | Y | Y | |
| Brand kit | Saved brand assets for the team | Y | | | |
| Custom background | | Y | Y | Y | |
| Color swatches for variants | | | | Y | |
| Remove vendor watermark | | Y | | | F Pro |
| Branded viewer frame | Your logo on the player | Y | | | F Business |
| Branded bookshelf and profile | | Y | | | |
| White label | No vendor branding anywhere | Y | | | |
| Save settings as defaults | Next catalog starts branded | Y | | | F free plan |

### 2.17 Team and accounts

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Several users | | Y | Y | | F Business up to 5, CM above Lite, Premium 10 |
| Roles and permissions | | Y | Y | | F Enterprise |
| Feature level permissions | Turn features on per role | Y | | | Enterprise |
| Activity log per user | | Y | | | Enterprise |
| Several workspaces | Per brand, department, location | Y | | | Add on |
| Agency mode | Many client accounts, one login | | Y | | |
| Team and personal media | | Y | | | |
| Folders and labels for catalogs | | Y | | | F Starter |
| Single sign on | | Y | | | Enterprise |

### 2.18 Integrations and API

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Zapier | | Y | Y | | F Business |
| REST API | | Y | Y | | F Enterprise |
| Webhooks | | Y | | | |
| Shopify | | | Y | Y | |
| HubSpot | | Y | Y | | |
| Salesforce | | Y | | | |
| Dropbox, Google Drive | | | Y | | |
| PIM, ERP connection | | Y | | | Paid add on |
| Assistants and language models | Connect the catalog to AI tools | Y | | | |
| Site builders | WordPress, Wix, Squarespace, Shopify, SharePoint, Notion | Y | Y | Y | Via embed code |

### 2.19 Search visibility, accessibility and compliance

| Feature | What it does | F | CM | CL | Tier notes |
|---|---|---|---|---|---|
| Search engine optimization | Titles, descriptions, indexable pages | Y | Y | | |
| Readable by AI answer engines | Text version of the catalog for crawlers | Y | | | |
| Block search engines | | Y | Y | | |
| Social preview | Title and image when the link is pasted | | Y | | |
| Accessibility features | Alt text, summaries, accessible PDF | Y | | | |
| Several languages | | Y | | Y | |
| Compliance documents | Privacy, security certifications | Y | | | |

## 3. Table stakes

All three products have these. A catalog builder without them will feel incomplete.

* Import products from a spreadsheet (top tier only at Flipsnack)
* Generate a catalog from product data plus a template
* Import an existing PDF as pages
* Drag and drop page builder
* Ready made layouts and templates, mixed freely in one catalog
* Headers, footers, table of contents
* Variants
* Barcodes on the page
* Logo, colors, fonts, custom background
* One click refresh when product data changes
* PDF export in standard page sizes
* Hosted link that opens on phone, tablet and desktop with nothing to install
* Page flip viewing
* Embed on a website
* Share by email and social
* Draft and published states, link only sharing, password protection
* Add to a list or cart from inside the catalog, with an order request

## 4. Differentiators

Only one of the three documents these. Each is a chance to stand out or a feature to skip.

Flipsnack only
* Rich media: video, audio, slideshows, popups, motion effects, quizzes
* Access control depth: named viewers, one time passcode, reader groups, leak watermark, domain restriction
* Per recipient trackable links and per reader statistics
* Schedule publish and unpublish
* Locked templates and element locks for brand control
* Editor depth: master layer, version history, guides, comments, notes
* Outputs beyond PDF: GIF, MP4, JPG, PNG
* AI translate, alt text, image generation
* White label, custom domain, brand kit
* WhatsApp checkout
* Paid publications

Catalog Machine only
* Custom fields per product category
* Catalogs rebuild automatically when a product changes
* Per variant price, SKU, image, barcode and stock, with display modes
* Calculated fields
* Full order desk: statuses, manual entry, tax, shipping, history, notes, CSV round trip
* Inventory enforced at order time
* Searchable showroom where buyers assemble their own PDF or quote
* Master catalog built from other catalogs
* Product index
* Agency mode
* AI that builds products and a catalog from a conversation, a URL or photos
* Ink saving PDF option
* Store sync beyond Shopify

Catalogly only
* Print bleed and prepress export
* Social media page formats
* Carousel viewing mode
* Label sheets
* Price override per catalog and percent wholesale discount
* Compare at price, currency rounding
* Custom CSS
* Variant color swatches
* Draft order handed to the store admin

## 5. What is paywalled, and what that signals

| Vendor | Free | Entry paid | Mid | Top |
|---|---|---|---|---|
| Flipsnack | PDF to flipbook, embed, public link, watermark | More pages, links, unlisted, QR, folders | Analytics, video, password, product tags, shopping list, no watermark | Branding, scheduling, named viewers, HTML5, Zapier, extra seats. Enterprise adds automation, API, sign on, roles, logs |
| Catalog Machine | Trial with every template, orders, store import | Lite: 100 products, 5 catalogs, 50 pages, 1 user | Pro: unlimited pages, password, several showrooms | Premium: 10,000 products, 50 catalogs, 10 users, priority support |
| Catalogly | 2 catalogs, 5 pages, flipbook, PDF, metafields, QR | Pro: 10 catalogs, unlimited pages, high resolution images | Advanced: 50 catalogs, automation and scheduled updates | Unlimited catalogs |

Patterns worth copying or avoiding
* All three gate on volume first: catalogs, pages, products, users.
* Removing the vendor watermark and password protection are the two most common first upgrades.
* Analytics is paid at Flipsnack and absent or thin at the other two. This is an open lane.
* Flipsnack puts product data automation at the very top tier. Catalog Machine and Catalogly give it away early. Buyers who need live pricing will not pay Flipsnack prices for it.
* AI is metered by monthly credits at two of the three.

## 6. Suggested build order

This section is a recommendation, not data from the vendors.

Phase 1, a usable product
* Product database with categories, custom fields, variants, tiered prices
* CSV and Excel import with column mapping and preview
* Layout presets by products per page, automatic grid, price list table
* Logo, colors, fonts, header, footer, table of contents
* PDF export with page sizes
* Hosted link with page flip and single page scroll
* Draft, published, link only, password
* One click refresh
* Clone a catalog

Phase 2, reasons to pay
* Price override and wholesale discount per catalog
* Collection rules for include and exclude, scheduled refresh
* Add to list, order request form, email confirmations, order dashboard with statuses
* View and click analytics, per recipient links
* Embed code, QR code
* Print bleed and prepress quality
* Team seats with roles

Phase 3, differentiation
* Searchable showroom with buyer built PDF and quote
* Online payment, tax, shipping, inventory enforcement
* PDF import with SKU detection to make an existing catalog shoppable
* AI import from URL, photo or conversation
* Named viewers, one time passcode, leak watermark
* Scheduling, version history, locked templates
* Store sync, Zapier, API
* Video, slideshows, popups

## 7. Not verified, and conflicts

* Catalog Machine prices are drawn by script and were not captured. Plan limits and feature names were. A third party listing shows 199 and 499 per month for higher tiers, which may be out of date. Check the live pricing page.
* Catalog Machine pricing page lists embed, automation, high resolution images, premium fonts, orders, and template types without making clear which plans include them. A third party summary places them at Pro. Treat tier as unconfirmed.
* Catalog Machine shows short passes of 39 for one month and 99 for three months, plan not stated.
* Catalogly contradicts itself on flipbook links. Its flipbook page says a flipbook is a snapshot and an update means a new link. Its home page and standalone page say the link stays the same after an update. Test before copying either behavior.
* Flipsnack publishes a full plan comparison table that could not be fetched. Tier notes come from the plan descriptions and may miss features.
* Flipsnack help categories for branding, collaboration, dashboard, PDF upload, integrations and white label were read at heading level only, not article by article.
* Flipsnack analytics articles were not opened, so its analytics rows are thinner than the product likely is.
* No hands on trial was done. Small interface behaviors, empty states, error handling and editor feel are not captured here.
* No review mining was done. Customer complaints would show what to do better.
* A blank cell means not found in the pages pulled. It does not mean the product lacks the feature.

## 8. Sources

Flipsnack
* https://help.flipsnack.com/en/articles/107456-pricing-plans-explained
* https://help.flipsnack.com/en/create-customize
* https://help.flipsnack.com/en/publish-download
* https://help.flipsnack.com/en/share-embed
* https://help.flipsnack.com/en/automation
* https://help.flipsnack.com/en/analytics

Catalog Machine
* https://www.catalogmachine.com/
* https://www.catalogmachine.com/product-tour
* https://www.catalogmachine.com/pricing
* https://help.catalogmachine.com/en/
* https://help.catalogmachine.com/en/articles/9607353-guide-to-catalog-machine-key-concepts-and-features-v2
* https://help.catalogmachine.com/en/articles/11963079-online-orders-payments-v2
* https://help.catalogmachine.com/en/articles/15363070-publishing-privacy-v2
* https://help.catalogmachine.com/en/articles/15363065-product-variants-pricing-v2

Catalogly
* https://cataloglyapp.com/
* https://cataloglyapp.com/pdf-catalogs
* https://cataloglyapp.com/flipbooks
* https://cataloglyapp.com/standalone
* https://cataloglyapp.com/shopify-integration
* https://apps.shopify.com/catalogly