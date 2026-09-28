# Video Game Collection Manager
## Master Product & Technical Specification

## 1. Project Overview

Build a modern web application for cataloguing, managing, exploring, and optionally publicly showcasing a physical video game collection.

The application will manage three primary collection categories:

- Consoles
- Games
- Accessories

The application should combine:

1. A canonical video game hardware/software catalog.
2. A personal physical collection.
3. Rich metadata.
4. Personal photos.
5. Interactive 3D representations.
6. AI-assisted metadata enrichment.
7. Powerful search, filtering, sorting, and organization.
8. Optional public collection browsing.
9. A polished, animated, highly visual user experience.

The application should not feel like a traditional admin CRUD dashboard.

The desired visual direction is:

- modern
- premium
- clean
- visually rich
- animated
- slightly futuristic
- collection/museum-like
- highly responsive
- enjoyable to browse

Magic UI should be used extensively to help achieve this experience.

---

## 2. Core Product Concept

The most important architectural rule is:

### Catalog entities and owned items are different things.

For example:

`Nintendo Entertainment System`

is a catalog entity.

But:

`My NES, serial number N1234567, stored in Retro Cabinet / Shelf 2`

is an owned physical item.

Similarly:

`Chrono Trigger`

is a game.

`Chrono Trigger / SNES / North America / Standard Edition`

is a specific game release.

And:

`My boxed copy of Chrono Trigger with a damaged manual`

is a physical collection item.

These concepts MUST remain separate throughout the architecture.

---

## 3. Initial User Model

For the first version, assume:

- there is one shared collection
- multiple authorized users may manage or view it
- collection items do not need individual ownership

The schema should nevertheless avoid architectural decisions that would make multiple collections impossible later.

A future version could introduce:

`Collection`

and:

`CollectionMember`

without requiring major changes to catalog entities.

Do NOT implement multi-collection support in the MVP.

---

## 4. Technology Stack

### Application

Use:

- Next.js
- App Router
- React
- TypeScript
- pnpm

Prefer stable releases.

Do not use experimental framework features unless there is a concrete benefit.

---

## 5. Database

Use:

- PostgreSQL
- Prisma ORM

Pin Prisma to a stable major version rather than automatically upgrading to release candidates.

Use PostgreSQL extensions where useful.

Recommended:

- `pg_trgm`
- PostgreSQL full-text search

Do NOT add Elasticsearch, Meilisearch, Typesense, or another search engine initially.

PostgreSQL is sufficient for this project.

---

## 6. UI Technology

Use:

- Tailwind CSS
- shadcn/ui
- Magic UI
- Lucide React
- Motion

### Responsibilities

Use **shadcn/ui** for foundational application components:

- buttons
- inputs
- forms
- selects
- comboboxes
- dialogs
- sheets
- popovers
- dropdown menus
- tooltips
- tables
- tabs
- breadcrumbs
- command palette
- badges
- switches
- alerts

Use **Magic UI** for:

- animated presentation
- visual effects
- animated collection cards
- background treatments
- animated borders
- entrance transitions
- animated statistics
- interactive surfaces
- hero areas
- visual empty states
- polished loading experiences
- animated navigation
- visual dashboard elements

Use **Motion directly** only when:

- Magic UI does not already provide the required interaction
- shared layout transitions are needed
- card → detail transitions are required
- complex orchestration is required
- route-specific custom interactions are required

Avoid unnecessary duplicate animation libraries.

---

## 7. Magic UI Design System

Magic UI should be considered a core design dependency rather than decorative extras.

However:

Do NOT use animated effects everywhere.

Animations must improve hierarchy, navigation, feedback, or delight.

They must not distract from collection content.

---

## 8. Magic UI Components We Expect to Use

### Collection cards

Use:

- Magic Card
- Glare Hover
- Shine Border

depending on context.

Do not combine every effect simultaneously.

### Dashboard statistics

Use:

- Number Ticker
- Animated Circular Progress Bar

Examples:

`127 Games`

`12 Consoles`

`34 Accessories`

### Page entrances

Use:

- Blur Fade

for:

- titles
- metadata
- cards
- sections

### Collections

Potentially use:

- Bento Grid

for dashboards or featured items.

Do not use Bento Grid for every regular collection listing.

Standard grid/list views should remain available.

### Backgrounds

Potentially use:

- Dot Pattern
- Grid Pattern
- Interactive Grid Pattern
- Retro Grid
- Flickering Grid
- Noise Texture

Use these subtly.

Collection content must remain the visual focus.

### Navigation

Potentially use:

- Dock

particularly on mobile/tablet if appropriate.

Desktop should use a conventional application sidebar unless another pattern proves clearly better.

### Recently added items

Potentially use:

- Animated List

for dashboard activity/recent collection additions.

### Buttons and CTAs

Potentially use:

- Shimmer Button
- Interactive Hover Button
- Ripple Button
- Pulsating Button

Use animated buttons primarily for important calls to action.

Normal CRUD buttons should remain simple.

### Special visual treatments

Potentially use:

- Lens
- Border Beam
- Particles
- Orbiting Circles
- Sparkles Text
- Animated Gradient Text

These should be used sparingly.

Avoid making the application resemble a SaaS landing page.

---

## 9. Design Principle for Magic UI

The application has two distinct visual contexts.

### Private application

Prioritize:

- efficiency
- readability
- CRUD usability
- search
- organization

Animations should be restrained.

### Public collection

Can be considerably more immersive.

The public collection should feel like:

`a personal digital video game museum`

Magic UI can be used more heavily here.

---

## 10. Authentication

Use:

Better Auth.

OAuth providers initially:

- Google
- GitHub

Additional providers should be easy to add later.

There is no public account registration.

---

## 11. Access Control

Successful OAuth login does NOT automatically grant application access.

Create:

`AccessGrant`

Fields:

- id
- email
- role
- enabled
- createdAt
- updatedAt

Roles:

- ADMIN
- EDITOR
- VIEWER

Authentication flow:

1. User authenticates through OAuth.
2. Obtain verified email.
3. Normalize email.
4. Query `AccessGrant`.
5. Confirm `enabled = true`.
6. Assign permissions based on role.
7. Otherwise reject private application access.

Never perform this check only client-side.

---

## 12. Authorization

ADMIN:

- full collection CRUD
- catalog CRUD
- settings
- users/access grants

EDITOR:

- collection CRUD
- enrichment
- media uploads

VIEWER:

- private collection read-only

Authorization must exist server-side for every mutation.

---

## 13. Storage

Do NOT store images, videos, or 3D models directly in PostgreSQL.

Use an S3-compatible object-storage abstraction.

Supported providers should include:

- MinIO
- Cloudflare R2
- DigitalOcean Spaces
- Backblaze B2
- AWS S3

The implementation should not depend on one provider.

For local development:

MinIO is preferred.

---

## 14. Asset Model

Create:

`Asset`

Fields:

- id
- kind
- objectKey
- mimeType
- sizeBytes
- width
- height
- originalFilename
- sha256
- sourceType
- sourceUrl
- licenseName
- licenseUrl
- attribution
- publicSafe
- metadata
- createdAt
- updatedAt

Kinds:

- IMAGE
- PHOTO
- LOGO
- SCREENSHOT
- COVER_ART
- BOX_ART
- LABEL
- MODEL_3D
- VIDEO
- DOCUMENT
- OTHER

Source types:

- USER_UPLOAD
- CURATED
- EXTERNAL_PROVIDER
- AI_ASSISTED
- IMPORTED

---

## 15. Asset Provenance

External assets must retain source information.

Where possible store:

- original URL
- source
- author
- license
- attribution
- usage restrictions

Never assume that an image or 3D model found online can legally be publicly redistributed.

Use:

`publicSafe`

to control whether it may appear on public pages.

---

## 16. 3D Architecture

Use:

- Three.js
- `@react-three/fiber`
- `@react-three/drei`

Preferred format:

`GLB`

Allow:

`GLTF`

when necessary.

---

## 17. Shared 3D Viewer

Create:

`<ModelViewer />`

Features:

- orbit controls
- touch controls
- zoom
- rotation
- reset camera
- fullscreen
- optional auto-rotate
- environment lighting
- loading state
- responsive rendering
- configurable model scale
- configurable camera
- configurable orientation
- image fallback
- reduced-motion behavior

3D must always be progressive enhancement.

An item remains usable without a model.

---

## 18. 3D Performance

Never render dozens of interactive Three.js scenes simultaneously in collection grids.

Collection cards should use:

- images
- rendered thumbnails
- static previews

Interactive 3D loads only when needed.

Examples:

- detail pages
- preview dialog
- fullscreen viewer

Dynamically import Three.js-heavy components.

---

## 19. Canonical Catalog

Create a reusable global catalog.

Primary catalog concepts:

- Company
- ConsolePlatform
- ConsoleModel
- Game
- GameRelease
- Accessory
- AccessoryVariant
- Region
- PackagingTemplate
- PhysicalMediaTemplate
- Asset
- ExternalReference

Catalog information belongs here.

Personal collection information does not.

---

## 20. Company

Create one reusable:

`Company`

rather than separate developer/publisher/manufacturer tables.

Fields:

- id
- name
- slug
- description
- country
- foundedYear
- website
- logoAssetId
- createdAt
- updatedAt

Companies can have different roles through relationships.

Examples:

Nintendo may be:

- console manufacturer
- accessory producer
- developer
- publisher

Sony may be:

- console manufacturer
- publisher

---

## 21. ConsolePlatform

Represents the general console.

Examples:

- Nintendo Entertainment System
- Super Nintendo Entertainment System
- Nintendo 64
- Sega Genesis
- PlayStation
- PlayStation 2

Fields:

- id
- name
- slug
- manufacturerId
- generation
- originalReleaseYear
- discontinuedYear
- description
- history
- defaultLogoAssetId
- metadata
- createdAt
- updatedAt

---

## 22. ConsoleModel

A platform may contain multiple hardware revisions/models.

Examples:

NES:

- NES-001
- NES-101

Genesis:

- Model 1
- Model 2
- Model 3

PlayStation 2:

- Fat variants
- Slim variants

Fields:

- id
- platformId
- name
- slug
- modelNumber
- regionId
- releaseYear
- discontinuedYear
- manufacturerId
- description
- defaultLogoAssetId
- default3DModelAssetId
- specifications
- dimensions
- weight
- createdAt
- updatedAt

---

## 23. Console Specifications

Use JSON for flexible specifications that vary by hardware.

Example structure:

```json
{
  "cpu": {},
  "graphics": {},
  "memory": {},
  "audio": {},
  "storage": {},
  "media": {},
  "videoOutputs": [],
  "audioOutputs": [],
  "controllerPorts": [],
  "expansionPorts": [],
  "power": {}
}
```

Properties commonly filtered or searched should remain real database fields.

---

## 24. Adding a Console

Use a polished multi-step flow.

### Step 1 — Select console

Searchable selector.

Results show:

- logo
- console name
- manufacturer
- generation
- release year

Use a shadcn Combobox/Command-based search.

Enhance result appearance with subtle Magic UI effects where appropriate.

### Step 2 — Select model

If the selected platform contains multiple models:

show another selector.

Example:

`Nintendo Entertainment System`

then:

`NES-001 Front Loader`

If only one model exists:

automatically select it.

### Step 3 — Preview

Show:

- console image
- logo
- model
- manufacturer
- year
- 3D preview if available

Use:

Magic Card

or similarly restrained Magic UI presentation.

### Step 4 — Physical item information

Fields:

- serial number
- region
- has box
- location
- defects
- notes
- personal photos

Serial number:

optional.

### Step 5 — Overrides

Optional:

- custom logo
- custom 3D model

Overrides apply only to this owned item.

Never modify canonical catalog data.

### Step 6 — Review

Display a review screen before creation.

Use subtle Blur Fade transitions between sections.

---

## 25. Console Detail Page

The detail page should feel like a premium product showcase.

Hero:

- 3D model
- console logo
- console name
- model
- manufacturer
- generation
- year

Use a subtle animated background such as:

- Grid Pattern
- Dot Pattern
- Retro Grid

Only if readability remains excellent.

---

## 26. Console Detail Sections

### My Console

Show:

- serial number
- region
- location
- has box
- defects
- notes
- personal photos

### Console Information

Show:

- manufacturer
- release year
- history
- description
- technical specifications
- model information

### Gallery

Display catalog imagery and personal photos separately.

---

## 27. Game Domain Model

Games need multiple abstraction levels.

Never model a game simply as:

`name + platform`

Create:

`Game`

and:

`GameRelease`

---

## 28. Game

Represents the conceptual game.

Example:

`Chrono Trigger`

Fields:

- id
- name
- slug
- description
- developer relationships
- external references
- createdAt
- updatedAt

---

## 29. GameRelease

Represents a specific release.

Example:

`Chrono Trigger / SNES / North America / Standard Edition`

Fields:

- id
- gameId
- platformId
- regionId
- editionName
- editionType
- releaseDate
- publisherId
- ratingValue
- ratingMaximum
- ratingSource
- playtimeMainMinutes
- playtimeMainExtrasMinutes
- playtimeCompletionistMinutes
- trailerProvider
- trailerId
- trailerUrl
- packagingTemplateId
- physicalMediaTemplateId
- metadata
- createdAt
- updatedAt

---

## 30. Game Editions

Support:

- Standard
- Limited
- Special

- Collector's
- Deluxe
- Greatest Hits
- Player's Choice
- Platinum
- Budget
- Re-release
- Bundle
- Custom

Allow:

`editionName`

to contain whatever official edition title exists.

---

## 31. Edition Contents

Create structured edition contents rather than storing one large text field.

Potential:

`GameReleaseIncludedItem`

Fields:

- id
- gameReleaseId
- name
- description
- quantity
- assetId
- sortOrder

Examples:

- soundtrack
- art book
- figure
- map
- manual
- steelbook
- poster
- bonus disc

---

## 32. Adding a Game

Use a multi-step flow.

### Step 1

Select platform.

### Step 2

Search game.

### Step 3

Select existing release or create release.

### Step 4

Choose:

- region
- edition

### Step 5

Personal copy information:

- serial/product number
- location
- has box
- defects
- notes
- photos

### Step 6

Optional:

`Enrich with AI`

### Step 7

Review.

### Step 8

Create.

---

## 33. AI-Assisted Metadata Enrichment

The AI enrichment feature must be provider-based.

Do not couple enrichment to one API.

Create interface conceptually equivalent to:

```ts
interface GameMetadataProvider {
  search(input: GameSearchInput): Promise<GameSearchResult[]>
  fetch(input: GameFetchInput): Promise<GameMetadataResult>
}
```

Possible providers:

- IGDB
- future game databases
- web research provider
- LLM provider
- manually entered metadata

---

## 34. Enrichment Flow

The user enters:

- game
- platform
- edition
- region

Then selects:

`Enrich with AI`

Flow:

1. Search structured metadata providers.
2. Determine likely candidates.
3. If ambiguous, show possible matches.
4. User selects correct result.
5. Fetch structured information.
6. Search other sources if information is missing.
7. Normalize metadata.
8. Show preview.
9. Display sources.
10. User accepts or rejects each suggestion.

Never automatically modify catalog information.

---

## 35. Enrichment Preview

For every suggested field show:

`Current`

versus:

`Suggested`

plus:

`Source`

and where possible:

`Confidence`

User actions:

- Apply all
- Apply selected
- Reject all

Manual values should never be silently overwritten.

---

## 36. Enrichment Information

Attempt to retrieve:

- release date
- release year
- publisher
- developer
- description
- screenshots
- cover art
- ratings
- trailer
- playtime
- special edition contents
- front box image
- back box image
- spine
- cartridge label
- official product images

Not all sources will contain all fields.

Missing data is acceptable.

Do not hallucinate missing information.

---

## 37. Enrichment Run

Create:

`EnrichmentRun`

Fields:

- id
- entityType
- entityId
- provider
- status
- query
- result
- acceptedData
- sourceReferences
- startedAt
- completedAt
- error

Statuses:

- PENDING
- RUNNING
- NEEDS_SELECTION
- COMPLETED
- FAILED

This creates an auditable enrichment history.

---

## 38. Screenshots

Game releases may contain multiple screenshots.

Create:

`GameScreenshot`

Fields:

- id
- gameReleaseId
- assetId
- caption
- sortOrder
- source

Display with an animated gallery.

Possible Magic UI enhancements:

- Blur Fade
- Lens

Do not animate large image transitions excessively.

---

## 39. Trailer

Support:

- YouTube
- direct video URL

Store structured provider information.

Never store arbitrary iframe HTML.

Create:

`<TrailerPlayer />`

Lazy-load the player.

---

## 40. Game Playtime

Model:

- main story
- main + extras
- completionist

Store:

- minutes
- source
- source URL
- updated timestamp

Never make the application depend entirely on one playtime website.

Manual values must be allowed.

---

## 41. Physical Packaging

Do NOT create a custom 3D mesh for every game.

Use reusable packaging templates.

Examples:

- NES cardboard box
- SNES cardboard box
- Genesis clamshell
- PlayStation jewel case
- Dreamcast jewel case
- PS2 DVD case
- PS3 Blu-ray case
- PS4 case
- Xbox case
- Xbox 360 case
- Xbox One case
- Nintendo Switch case

---

## 42. PackagingTemplate

Fields:

- id
- name
- slug
- geometryType
- baseModelAssetId
- dimensions
- materialSettings
- cameraSettings
- metadata

Then define texture slots.

---

## 43. PackagingTextureSlot

Examples:

- FRONT
- BACK
- SPINE
- TOP
- BOTTOM
- INNER

Fields:

- id
- packagingTemplateId
- name
- required
- materialName
- metadata

A GameRelease supplies assets for these slots.

Then:

`Template + artwork → interactive 3D package`

---

## 44. Cartridge Architecture

Apply the same approach to cartridges.

Create templates such as:

- NES US
- Famicom
- SNES US
- Super Famicom
- Genesis
- Game Boy
- Game Boy Color
- Game Boy Advance
- Nintendo 64

---

## 45. PhysicalMediaTemplate

Fields:

- id
- name
- type
- baseModelAssetId
- dimensions
- materialSettings
- cameraSettings
- metadata

Types:

- CARTRIDGE
- DISC
- CARD
- OTHER

Texture slots might include:

- FRONT_LABEL
- BACK_LABEL
- DISC_ART

---

## 46. Game Detail Page

The game page should be one of the application's strongest visual experiences.

Hero:

- title
- platform
- cover
- release year
- publisher
- rating
- region
- edition

Use tasteful Magic UI animation.

---

## 47. Game Detail Sections

### My Copy

Show:

- edition
- region
- serial/product number
- location
- has box
- defects
- notes
- personal photos

### About

Show:

- description
- developer
- publisher
- release date
- rating
- playtime

### Screenshots

Animated gallery.

### Physical Edition

Show:

- interactive 3D box
- interactive cartridge/disc

### Edition Contents

Show included collector items.

### Trailer

Embedded video.

---

## 48. Accessory Domain Model

Separate:

`Accessory`

from:

`AccessoryVariant`

---

## 49. Accessory

Example:

`DualShock 2`

Fields:

- id
- name
- slug
- producerId
- description
- releaseYear
- rating
- default3DModelAssetId
- createdAt
- updatedAt

Accessories may support multiple platforms.

Create a many-to-many relationship.

---

## 50. AccessoryVariant

Examples:

DualShock 2:

- Black
- Satin Silver
- Ceramic White
- Ocean Blue

Fields:

- id
- accessoryId
- name
- regionId
- releaseYear
- color
- edition
- default3DModelAssetId
- metadata

---

## 51. Adding an Accessory

Fields:

- platform compatibility
- accessory
- version/edition
- producer
- region
- serial number
- location
- has box
- defects
- photos
- custom 3D model
- notes

Provide:

`Enrich with AI`

where catalog metadata is incomplete.

---

## 52. Accessory Enrichment

Attempt to retrieve:

- year
- manufacturer
- description
- product images
- edition information
- included items
- rating
- product video/trailer

Use the same enrichment infrastructure as games.

---

## 53. Accessory Detail

Hero:

- accessory
- platform compatibility
- producer
- year
- interactive 3D

Sections:

- My Accessory
- Product Information
- Gallery
- Specifications
- Video

---

## 54. Shared Collection Architecture

Create:

`CollectionItem`

Fields:

- id
- type
- serialNumber
- locationId
- hasBox
- notes
- createdAt
- updatedAt

Types:

- CONSOLE
- GAME
- ACCESSORY

Create specialized records:

- OwnedConsole
- OwnedGame
- OwnedAccessory

Each specialized record has a one-to-one relationship with `CollectionItem`.

---

## 55. OwnedConsole

Contains:

- collectionItemId
- consoleModelId
- regionId
- customLogoAssetId
- custom3DModelAssetId

---

## 56. OwnedGame

Contains:

- collectionItemId
- gameReleaseId

---

## 57. OwnedAccessory

Contains:

- collectionItemId
- accessoryVariantId
- custom3DModelAssetId

---

## 58. Defects

Never store defects as one multiline string.

Create:

`Defect`

Fields:

- id
- collectionItemId
- title
- description
- severity
- status
- createdAt
- updatedAt

Severity:

- COSMETIC
- MINOR
- MAJOR
- CRITICAL

Status:

- ACTIVE
- REPAIRED
- ACCEPTED

Examples:

- Yellowed plastic
- Broken hinge
- Scratched disc
- Damaged label
- Intermittent controller port
- Missing battery cover

---

## 59. Locations

Do not use free-form location strings for collection items.

Create hierarchical:

`Location`

Fields:

- id
- parentId
- name
- type
- description
- sortOrder

Types:

- PROPERTY
- ROOM
- FURNITURE
- SHELF
- CONTAINER
- CUSTOM

Example:

`Home / Office / Retro Cabinet / Shelf 2`

---

## 60. Location Manager

Provide `/locations`.

Allow:

- add
- rename
- reorder
- nest
- move
- delete when unused

The UI should visually communicate hierarchy.

---

## 61. Collection Photos

Create:

`CollectionItemMedia`

Fields:

- id
- collectionItemId
- assetId
- type
- caption
- sortOrder

Media types:

- PHOTO
- FRONT
- BACK
- LEFT
- RIGHT
- TOP
- BOTTOM
- SERIAL
- BOX
- DAMAGE
- OTHER

Allow drag-and-drop ordering.

---

## 62. Collection Home

Create a unified:

`/collection`

private view.

The user can switch between:

- All
- Consoles
- Games
- Accessories

Views:

- Grid
- List

Remember view preference locally.

---

## 63. Collection Cards

Cards should be visually attractive but remain easy to scan.

Use Magic UI's:

`Magic Card`

as the preferred enhanced collection card foundation.

Use its interaction subtly.

---

## 64. Console Card

Show:

- console image
- logo
- console name
- model
- year
- location
- boxed indicator
- defect indicator

---

## 65. Game Card

Show:

- cover
- game name
- platform
- region
- edition
- release year
- boxed indicator

Because game covers are visually strong, the cover should remain the primary visual.

Do not allow effects to overpower box art.

---

## 66. Accessory Card

Show:

- image
- name
- platform
- producer
- variant
- year

---

## 67. Card Animations

Potential effects:

- subtle Magic Card cursor glow
- slight image scale
- small elevation
- border transition

Avoid:

- excessive rotation
- large parallax
- aggressive glow
- constant animation

Cards should feel premium, not distracting.

---

## 68. Card to Detail Transition

Use Motion shared layout functionality when appropriate.

Transition:

collection card

→

detail hero

Possible shared elements:

- cover/image
- title
- logo

Transition should be quick and responsive.

If the interaction introduces performance problems:

prefer a simpler fade/slide.

---

## 69. Search

Implement global search.

Search:

- consoles
- models
- games
- accessories
- manufacturers
- publishers
- platforms
- editions
- regions
- defects
- notes
- serial numbers for authenticated users

Use PostgreSQL.

Combine:

- full-text search
- trigram fuzzy matching

---

## 70. Global Search Palette

Implement:

`⌘ K`

and:

`Ctrl + K`

Use shadcn Command.

Search results grouped by:

- Consoles
- Games
- Accessories
- Catalog

Animate results subtly using Blur Fade or Motion.

---

## 71. Filtering

All items:

- type
- platform
- manufacturer
- release year
- location
- region
- has box
- has defects

Games:

- platform
- publisher
- year
- region
- edition
- rating
- has box

Consoles:

- manufacturer
- console
- model
- year
- region
- location
- has box

Accessories:

- platform
- producer
- year
- region
- location
- has box

---

## 72. URL Filters

Whenever practical, filters must use URL search parameters.

Example:

```text
/games?platform=snes&region=north-america&hasBox=true
```

Advantages:

- refresh-safe
- browser navigation works
- shareable
- bookmarkable

---

## 73. Sorting

Global:

- Name A–Z
- Name Z–A
- Recently added
- Oldest added
- Release year ascending
- Release year descending
- Location

Games:

- Rating
- Publisher
- Platform

---

## 74. Dashboard

Private dashboard.

Show:

- total collection
- consoles
- games
- accessories
- boxed items
- items with active defects

Use Magic UI Number Ticker.

---

## 75. Dashboard Visualization

Use a restrained Bento Grid to arrange key dashboard information.

Example:

large card:

`Total Collection`

smaller cards:

`Games`

`Consoles`

`Accessories`

another card:

`Recently Added`

another:

`Collection Breakdown`

---

## 76. Dashboard Backgrounds

Optional subtle treatments:

- Dot Pattern
- Grid Pattern
- Retro Grid

These should have extremely low visual weight.

Never compromise text contrast.

---

## 77. Recently Added

Use Magic UI Animated List or an equivalent animated collection row.

Show:

- thumbnail
- title
- category
- date added

---

## 78. Analytics

Optional later:

- items by platform
- items by manufacturer
- items by generation
- items by region
- items added over time
- boxed percentage
- collection condition

Not part of MVP priority.

---

## 79. Public Collection

Create public routes:

```text
/collection
/collection/consoles
/collection/consoles/[slug]
/collection/games
/collection/games/[slug]
/collection/accessories
/collection/accessories/[slug]
```

The root `/collection` can detect whether the visitor is authenticated, but public data must still come through public-safe queries.

---

## 80. Public Collection Setting

Create:

`publicCollectionEnabled`

When false:

public routes display:

`This collection is currently private.`

Do not expose any collection data.

---

## 81. Public Collection Design

The public experience should be more immersive than the private application.

Think:

`personal interactive video game museum`

Rather than:

`database admin page`

Magic UI should be used considerably more here.

---

## 82. Public Collection Hero

Potential design:

title:

`Mauro's Game Collection`

statistics:

- consoles
- games
- accessories
- generations represented

Use:

- Blur Fade
- Number Ticker
- subtle Retro Grid
- subtle Particles if performance is acceptable

Do not make the public site resemble a generic AI startup landing page.

The visual language should clearly reference gaming history and physical collecting.

---

## 83. Public Featured Collection

Use Bento Grid selectively.

Examples:

- newest console
- favorite console
- rare game
- latest addition
- oldest item

This can later become configurable.

---

## 84. Public Privacy

Default hidden:

- serial numbers
- exact location
- private notes
- access/account information

Settings:

- showSerialNumbers
- showLocations
- showNotes
- showDefects
- showPersonalPhotos

Defaults should prioritize privacy.

---

## 85. Public Query Security

Do NOT fetch the full private object and hide properties with CSS.

Create dedicated public queries.

Example:

`getPublicGame()`

should select only properties permitted publicly.

Privacy must be enforced server-side.

---

## 86. Search Engine Indexing

Setting:

`allowSearchEngineIndexing`

Default:

false

When false:

return appropriate robots metadata.

---

## 87. Application Navigation

Desktop:

sidebar.

Primary items:

- Dashboard
- Collection
- Consoles
- Games
- Accessories
- Locations
- Catalog
- Settings

---

## 88. Mobile Navigation

Evaluate Magic UI Dock for mobile navigation.

Potential items:

- Home
- Collection
- Add
- Search
- Settings

The center Add action can receive stronger visual treatment.

Do not use Dock if usability testing indicates a standard mobile navigation is better.

---

## 89. Add Item Flow

Global:

`+ Add Item`

opens options:

- Console
- Game
- Accessory

Use an animated dialog/sheet.

The transition should feel fast.

Do not use long decorative animations before opening forms.

---

## 90. Forms

Use:

- React Hook Form
- Zod
- shadcn form primitives

Requirements:

- client validation
- server validation
- helpful validation messages
- unsaved changes protection
- loading states
- success/error feedback
- mobile friendly inputs

---

## 91. Photo Upload

Phone usage is important.

Allow:

- photo library
- phone camera
- drag/drop desktop

Display upload progress.

Allow:

- reorder
- delete
- caption
- classify

---

## 92. Image Processing

Where appropriate:

- auto-orient based on EXIF
- strip unnecessary metadata
- generate thumbnails
- create WebP/AVIF derivatives

Keep original where valuable.

Do not aggressively recompress personal collection photography.

---

## 93. Catalog Administration

Create:

`/catalog`

ADMIN only.

Manage:

- companies
- console platforms
- console models
- games
- game releases
- accessories
- variants
- regions
- packaging templates
- physical media templates
- assets

---

## 94. Catalog Seeds

Initial catalog data should be version controlled.

Suggested:

```text
prisma/
  seed-data/
    companies/
    consoles/
    regions/
    accessories/
    packaging/
```

Seed operations must be idempotent.

---

## 95. Initial Console Catalog

Do not attempt every gaming console ever created.

Start with widely collected systems.

For example:

Nintendo:

- NES
- SNES
- Nintendo 64
- GameCube
- Wii
- Wii U
- Switch
- Switch 2

Portable:

- Game Boy
- Game Boy Color
- Game Boy Advance
- Nintendo DS
- Nintendo 3DS

Sega:

- Master System
- Genesis / Mega Drive
- Sega CD
- 32X
- Saturn
- Dreamcast

Sony:

- PlayStation
- PlayStation 2
- PlayStation 3
- PlayStation 4
- PlayStation 5
- PSP
- Vita

Microsoft:

- Xbox
- Xbox 360
- Xbox One
- Xbox Series

Then expand.

---

## 96. External References

Create:

`ExternalReference`

Fields:

- id
- entityType
- entityId
- provider
- externalId
- url
- metadata

Providers might include:

- IGDB
- Wikipedia
- official manufacturer
- YouTube
- MobyGames
- Sketchfab
- other future services

Do not fill primary database models with provider-specific fields.

---

## 97. Region

Create canonical:

`Region`

Examples:

- North America
- Japan
- Europe
- Australia
- Korea
- China
- Brazil
- Worldwide
- Region Free

Optional metadata:

- NTSC-U
- NTSC-J
- PAL

Do not assume TV format and commercial region are exactly the same concept.

---

## 98. AI Architecture

AI features should be isolated behind:

`AIService`

Do not call OpenAI or another provider directly throughout application code.

Concept:

```ts
interface AIProvider {
  generateStructuredData<T>(...)
}
```

Then implementation:

- OpenAI
- future local model
- future alternative provider

---

## 99. AI Rules

AI is advisory.

AI must NOT:

- automatically publish catalog data
- silently overwrite manual data
- invent missing metadata
- assign uncertain artwork automatically

Every AI operation should be reviewable.

---

## 100. Background Tasks

Do not introduce Redis initially.

For MVP:

short enrichment operations can run through application server flows.

If later required:

add:

- Redis
- BullMQ
- worker process

Possible future background jobs:

- metadata enrichment
- asset processing
- thumbnail generation
- image optimization
- large imports

---

## 101. Server Architecture

Use Next.js as the backend initially.

Do NOT introduce NestJS.

Use:

- Server Components
- Server Actions when appropriate
- Route Handlers where appropriate
- server-only services
- repositories

---

## 102. Architectural Layers

Use:

```text
UI
↓
Feature layer
↓
Services
↓
Repositories
↓
Prisma
↓
PostgreSQL
```

React components should never contain substantial business logic.

---

## 103. Feature Organization

Suggested:

```text
src/
  app/

  components/
    ui/
    magic/
    layout/
    media/
    three/
    search/

  features/
    consoles/
    games/
    accessories/
    collection/
    catalog/
    locations/
    enrichment/
    public-collection/

  server/
    auth/
    db/
    repositories/
    services/
    storage/
    search/
    ai/

  lib/
    motion/
    three/
    utils/
```

---

## 104. Magic UI Components

Magic UI components added through the registry should live consistently with the project's UI component convention.

Do not unnecessarily modify upstream Magic UI components.

When significant project-specific customization is required:

wrap the Magic UI component.

Example:

```text
components/
  magic/
    collection-magic-card.tsx
```

instead of repeatedly modifying the base component.

---

## 105. Server Components

Server Components by default.

Client Components only for:

- forms requiring browser interaction
- Magic UI animated components
- Motion interactions
- Three.js
- drag/drop
- galleries
- browser APIs

Do not mark high-level layouts `"use client"` unnecessarily.

---

## 106. Prisma Architecture

Use:

- UUID primary keys
- foreign keys
- proper unique constraints
- indexes
- explicit relationships
- deliberate delete behavior

Do not store relationships only in JSON.

---

## 107. Search Indexes

Index frequently queried fields.

Examples:

- collection type
- platform
- release year
- location
- region
- createdAt
- game name
- console name
- manufacturer
- publisher

Use trigram indexes for fuzzy names.

---

## 108. Suggested Database Models

Authentication:

- User
- Session
- Account
- Verification
- AccessGrant

Configuration:

- AppSettings
- PublicSettings

Catalog:

- Company
- ConsolePlatform
- ConsoleModel
- Game
- GameRelease
- GameReleaseIncludedItem
- Accessory
- AccessoryVariant
- Region
- PackagingTemplate
- PackagingTextureSlot
- PhysicalMediaTemplate
- PhysicalMediaTextureSlot
- ExternalReference

Collection:

- CollectionItem
- OwnedConsole
- OwnedGame
- OwnedAccessory
- Location
- Defect

Media:

- Asset
- CollectionItemMedia
- CatalogAsset

Enrichment:

- EnrichmentRun

---

## 109. Public Settings

Potential model:

```ts
PublicSettings {
  publicCollectionEnabled
  allowSearchEngineIndexing
  showSerialNumbers
  showLocations
  showNotes
  showDefects
  showPersonalPhotos
}
```

---

## 110. Application Settings

Potential:

- collectionName
- collectionDescription
- collectionLogo
- defaultTheme
- publicCollectionEnabled
- preferredCurrency
- timezone

Currency is not used in MVP but could support future valuations.

---

## 111. Theme

Support:

- light mode
- dark mode
- system

Use shadcn theme conventions.

Magic UI effects must be tested in both themes.

3D viewer environment should adapt appropriately.

---

## 112. Visual Identity

Avoid excessive gradients associated with generic AI applications.

Prefer:

- neutral surfaces
- strong typography
- collection artwork providing color
- subtle glass only where useful
- soft borders
- controlled shadows

Use Magic UI effects as accents.

---

## 113. Retro Influence

The app may include subtle retro-inspired visual elements.

Examples:

- Retro Grid
- pixel-like decorative details
- console-era accent colors
- CRT-inspired effects in specific places

Do NOT turn the entire interface into pixel art.

The core application should remain modern.

---

## 114. Loading States

Provide:

- skeletons
- progressive image loading
- lazy 3D
- animated placeholders

Magic UI components can enhance loading states where appropriate.

Avoid infinite spinners when skeletons can communicate structure.

---

## 115. Empty States

Examples:

`No consoles yet`

`Add your first console to start building your collection.`

Use subtle visual animation.

Potential:

- animated icon
- grid background
- Blur Fade

Do not use excessive effects.

---

## 116. Errors

Errors should clearly explain:

- what happened
- whether data was saved
- what action to try next

Never rely solely on toast notifications for critical errors.

---

## 117. Performance

Target excellent perceived performance.

Prioritize:

- Server Components
- image optimization
- code splitting
- dynamic imports
- pagination
- lazy 3D
- deferred nonessential animation
- reduced JS where possible

---

## 118. Magic UI Performance Rules

Magic UI effects must not automatically be added to every screen.

Before adding an animated component consider:

1. Does it improve usability?
2. Does it improve hierarchy?
3. Does it provide useful feedback?
4. Does it significantly improve presentation?

If none apply:

use normal shadcn UI.

---

## 119. Mobile Performance

Disable or simplify expensive visual effects on weaker/mobile devices if required.

Particularly:

- particles
- complex grids
- multiple blur effects
- large Three.js scenes

---

## 120. Reduced Motion

Always respect:

`prefers-reduced-motion`

When enabled:

- remove decorative movement
- shorten transitions
- disable auto-rotating models
- avoid animated backgrounds

Functionality must remain unchanged.

---

## 121. Accessibility

Required:

- keyboard navigation
- focus indicators
- semantic HTML
- accessible forms
- screen-reader labels
- accessible dialogs
- image alt text
- sufficient contrast
- reduced-motion support

Animation must never communicate essential information by itself.

---

## 122. Responsive Design

Support:

- desktop
- tablet
- mobile

Mobile should be first-class.

Adding collection items on a phone is especially important because users can take photos directly.

---

## 123. Security

Private routes require authentication.

Mutations require authorization.

Never trust:

- client role
- client user ID
- client-provided catalog IDs without validation

---

## 124. Upload Security

Validate:

- MIME type
- extension
- file size

Generate random storage keys.

Never use original filename as object key.

Supported images initially:

- JPEG
- PNG
- WebP
- AVIF

3D:

- GLB

Do not accept arbitrary HTML.

SVG uploads should be limited to trusted assets or sanitized appropriately.

---

## 125. Environment Variables

Example:

```env
DATABASE_URL=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=

AI_PROVIDER=
AI_API_KEY=
```

Maintain:

`.env.example`

Never commit secrets.

---

## 126. Docker

The project should be Docker-ready.

Potential production stack:

```text
reverse-proxy
nextjs
postgres
object-storage
```

Future optional:

```text
redis
worker
```

---

## 127. Deployment Independence

Do not design the architecture around Vercel-specific functionality.

The application must run correctly on:

- VPS
- DigitalOcean Droplet
- Docker host
- similar infrastructure

Vercel deployment may remain possible, but must not be required.

---

## 128. Backups

Document backup procedures.

Back up:

- PostgreSQL
- object storage

Database backups should be automated.

Critical collection media must not live solely on an ephemeral container filesystem.

---

## 129. Logging

Use structured logs.

Log:

- authentication failures
- authorization failures
- enrichment jobs
- enrichment failures
- uploads
- server errors

Never log:

- OAuth tokens
- credentials
- secrets

---

## 130. Testing

Use:

- Vitest
- React Testing Library
- Playwright

---

## 131. Unit Tests

Test:

- validation
- normalization
- permission logic
- search helpers
- enrichment normalization
- public privacy transformations

---

## 132. Integration Tests

Test:

- repository behavior
- service behavior
- database constraints
- authentication allowlist
- public query privacy

---

## 133. Playwright

Critical flows:

1. Authorized login.
2. Unauthorized login rejected.
3. Add console.
4. Edit console.
5. Delete console.
6. Add game.
7. Edit game.
8. Enrich game.
9. Add accessory.
10. Edit accessory.
11. Upload photos.
12. Search.
13. Filter.
14. Manage location.
15. Enable public collection.
16. View public item.
17. Confirm private serial number remains hidden.
18. Confirm private location remains hidden.

---

## 134. Initial Pages

Private:

```text
/
/collection
/consoles
/consoles/new
/consoles/[id]
/consoles/[id]/edit

/games
/games/new
/games/[id]
/games/[id]/edit

/accessories
/accessories/new
/accessories/[id]
/accessories/[id]/edit

/locations

/catalog
/catalog/consoles
/catalog/games
/catalog/accessories

/settings
/settings/access
/settings/public
```

---

## 135. Public Pages

```text
/collection
/collection/consoles
/collection/consoles/[slug]

/collection/games
/collection/games/[slug]

/collection/accessories
/collection/accessories/[slug]
```

Routing details can be adjusted if private/public namespace conflicts become awkward.

---

## 136. MVP Scope

MVP should include:

### Authentication

- Google
- GitHub
- email allowlist
- roles

### Collection

- consoles
- games
- accessories

### Shared functionality

- locations
- defects
- photos
- notes
- search
- filters
- sorting

### Catalog

- console platforms
- console models
- games
- game releases
- accessories
- accessory variants

### 3D

- console GLB viewing
- initial game box templates
- initial cartridge templates

### AI

- game enrichment
- accessory enrichment foundation

### Public

- public collection toggle
- public collection
- privacy settings

### UI

- shadcn
- Magic UI
- Motion
- responsive design
- dark/light mode

---

## 137. Explicit MVP Non-Goals

Do NOT initially build:

- marketplace
- trading
- messaging
- user registration
- native mobile application
- social network features
- achievements
- gamification
- automatic valuations
- automatic price tracking
- Elasticsearch
- microservices
- NestJS API
- Redis
- queues
- AI-generated unique meshes for every game
- mass web scraping
- full game database recreation

---

## 138. Development Phase 0 — Repository Foundation

Implement:

- Next.js
- TypeScript
- pnpm
- Tailwind
- shadcn
- Magic UI setup
- Prisma
- PostgreSQL
- Better Auth
- Docker development environment
- linting
- formatting
- testing foundation

Deliverable:

Application boots successfully.

---

## 139. Development Phase 1 — Authentication

Implement:

- Google OAuth
- GitHub OAuth
- AccessGrant
- roles
- server authorization
- protected routes

Deliverable:

Only authorized users access private application.

---

## 140. Development Phase 2 — Design System

Build shared application layout.

Implement:

- desktop sidebar
- mobile navigation
- typography
- theme
- cards
- page headers
- forms
- dialogs
- search
- loading states

Integrate Magic UI foundations:

- Magic Card
- Blur Fade
- Number Ticker
- selected patterns/backgrounds
- appropriate buttons

Create animation guidelines.

Deliverable:

Reusable UI system.

---

## 141. Development Phase 3 — Shared Collection Infrastructure

Build:

- CollectionItem
- Asset
- media
- Location
- Defect
- search
- filters
- sorting
- grid/list
- uploads

Deliverable:

Shared domain foundation.

---

## 142. Development Phase 4 — Consoles

Implement:

- Company
- ConsolePlatform
- ConsoleModel
- console seed catalog
- add console
- edit console
- delete console
- console detail
- 3D viewer
- overrides

Deliverable:

Fully usable console collection.

---

## 143. Development Phase 5 — Games

Implement:

- Game
- GameRelease
- Region
- edition
- game CRUD
- screenshots
- rating
- playtime
- trailers
- IGDB provider

Deliverable:

Fully usable game collection.

---

## 144. Development Phase 6 — AI Enrichment

Implement:

- provider architecture
- enrichment runs
- preview
- field comparison
- source information
- selective acceptance

Deliverable:

Safe metadata enrichment workflow.

---

## 145. Development Phase 7 — Physical Game 3D

Build:

- PackagingTemplate
- texture slots
- PhysicalMediaTemplate
- cartridge templates
- 3D box renderer
- 3D cartridge renderer

Start with relevant retro systems.

Recommended initial templates:

- NES
- SNES
- Genesis
- Nintendo 64
- Game Boy
- PlayStation
- PS2

Then add modern systems.

Deliverable:

Selected physical games rendered in interactive 3D.

---

## 146. Development Phase 8 — Accessories

Implement:

- Accessory
- AccessoryVariant
- platform compatibility
- CRUD
- enrichment
- 3D
- detail pages

Deliverable:

Fully usable accessory collection.

---

## 147. Development Phase 9 — Dashboard

Build:

- total statistics
- animated counts
- recently added
- Bento dashboard
- collection breakdown

Use Magic UI strategically.

Deliverable:

Polished collection overview.

---

## 148. Development Phase 10 — Public Museum

Build:

- public toggle
- public privacy
- public pages
- public filtering/search
- public details
- immersive hero
- public visual polish

Use Magic UI more prominently.

Deliverable:

Shareable digital collection.

---

## 149. Development Phase 11 — UX Polish

Review:

- transitions
- loading
- empty states
- card animations
- mobile
- accessibility
- reduced motion
- responsiveness
- performance

Remove animations that do not improve the application.

---

## 150. Development Phase 12 — Hardening

Perform:

- security review
- permission review
- upload review
- public privacy review
- performance tests
- database indexes
- backups
- logging
- deployment documentation

Deliverable:

Production-ready application.

---

## 151. Codex Development Rules

Codex MUST follow these rules.

1. Implement one phase at a time.
2. Inspect existing architecture before changing it.
3. Do not implement future phases prematurely.
4. Prefer established project abstractions.
5. Do not duplicate CRUD logic unnecessarily.
6. Keep business logic outside React components.
7. Keep database access outside UI components.
8. Validate server input with Zod.
9. Authorize every mutation server-side.
10. Never trust client roles.
11. Add Prisma migrations for schema changes.
12. Never manually alter production database structure.
13. Add tests for important behavior.
14. Keep README current.
15. Keep `.env.example` current.
16. Do not introduce dependencies without justification.
17. Avoid unnecessary abstractions.
18. Preserve canonical catalog data separately from owned items.
19. Editing owned items must not modify canonical catalog entities.
20. Preserve metadata provenance.
21. Never silently overwrite manually entered metadata.
22. Never expose private fields through public queries.
23. Do not render interactive 3D in every collection card.
24. Lazy-load Three.js.
25. Respect reduced motion.
26. Build mobile experiences intentionally.
27. Use Magic UI only when it adds meaningful value.
28. Use shadcn for conventional application controls.
29. Use Motion directly only when Magic UI/shadcn cannot implement the required interaction cleanly.
30. Do not install another animation library without a strong reason.
31. Avoid large Client Component trees.
32. Use Server Components by default.
33. Keep third-party providers behind adapters.
34. Do not hard-code provider APIs throughout domain code.
35. Before declaring a phase complete, run:
   - lint
   - typecheck
   - unit tests
   - relevant integration tests
   - relevant Playwright tests

---

## 152. Magic UI Rules for Codex

When building UI:

Do NOT arbitrarily choose Magic UI effects.

For every page determine:

### Functional UI

Use shadcn.

### Enhanced visual container

Consider Magic Card.

### Entering content

Consider Blur Fade.

### Animated number

Use Number Ticker.

### Decorative background

Consider one Magic UI pattern.

### Complex transition

Use Motion.

### Standard button

Use shadcn Button.

### Important CTA

Potentially use an appropriate Magic UI button.

---

## 153. Avoid Visual Overload

Never combine:

- animated border
- glare
- particles
- gradient text
- animated background
- cursor effect

all within one component.

Prefer one primary visual effect per element.

The application should feel carefully designed rather than automatically generated.

---

## 154. Product Philosophy

### Collection first

The user's actual physical collection is the heart of the application.

### Catalog assists the collection

The catalog exists to avoid repeatedly entering known information.

### Physical releases matter

Region, edition, packaging, and hardware model differences are first-class concepts.

### AI assists

AI does not make irreversible decisions.

### 3D enhances

3D does not replace normal images or metadata.

### Public mode is safe

Privacy rules are enforced on the server.

### Motion has purpose

Animation should communicate state, hierarchy, and navigation.

### Magic UI provides polish

It should enhance the experience without dominating it.

---

## 155. Future Features

After the core application is successful, consider:

### Collection management

- wishlist
- purchase date
- purchase price
- seller
- estimated value
- insurance value
- condition grading
- duplicate detection

### Hardware

- repair history
- modifications
- firmware
- power supply
- video cables
- controllers
- attached accessories

### Physical organization

- QR codes
- shelf labels
- scan item location
- move items in bulk

### Camera/AI

- barcode scanning
- cartridge recognition
- box recognition
- serial OCR
- cover recognition
- automatic defect detection

### Discovery

- missing games for platform
- collection completion percentage
- series completion
- recommended additions

### Data portability

- CSV import
- CSV export
- JSON export
- printable inventory
- insurance PDF

### Valuation

- market pricing
- historical value
- price alerts

### Public museum

- featured items
- collection timeline
- console generations
- interactive collection history
- curated shelves
- public share links

---

## 156. Final Definition of Done

A feature is complete only when:

- database changes exist
- migrations exist
- authorization exists
- server validation exists
- service/domain logic exists
- UI exists
- mobile works
- desktop works
- loading state exists
- empty state exists
- error state exists
- accessibility is considered
- reduced motion is considered
- private/public behavior is correct
- relevant tests pass
- lint passes
- TypeScript passes

---

## 157. First Codex Instruction

After creating the repository, give Codex this instruction:

```text
Read the complete project specification before writing code.

We are going to implement this project phase by phase.

Do not attempt to build the complete application immediately.

Start with Phase 0 only.

Before implementing anything:

1. Propose the initial repository architecture.
2. List the packages you intend to install and explain why each is necessary.
3. Identify any architectural decisions that need to be made before implementation.
4. Do not introduce functionality belonging to later phases.
5. Keep the architecture compatible with all later phases in the specification.
6. Prefer Server Components.
7. Keep business logic outside React components.
8. Use shadcn/ui for functional UI primitives.
9. Use Magic UI as the primary animated/visual enhancement library.
10. Use Motion directly only for custom animation requirements Magic UI does not cover.
11. Do not install additional UI or animation libraries without justification.
12. Assume the application will eventually be self-hosted using Docker on a VPS.

Once the architecture is established, implement Phase 0 and verify:

- development server starts
- database connection works
- Prisma migrations work
- Tailwind works
- shadcn works
- Magic UI works
- tests run
- lint passes
- TypeScript passes

Do not begin Phase 1 until Phase 0 is complete.
```