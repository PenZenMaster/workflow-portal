# The LightAgency Lights-Out SEO Factory

## 1. Mission

Build an agency production system where a client can move from approved strategy and structured intake data to implemented, measured, and continuously improved digital visibility with minimal manual production effort.

The operating vision is:

**Approve the client configuration. Release it to production. The factory does the rest.**

The factory should eventually be capable of:

* ingesting structured client data
* discovering and validating entities
* building keyword and prompt universes
* creating site architecture
* producing WordPress pages
* generating metadata and schema
* creating location and service content
* building internal links
* producing supporting authority assets
* publishing Google Stack and cloud assets
* updating WordPress through APIs
* testing implementation quality
* running recurring data extraction and ETL
* populating reporting systems
* identifying opportunities
* triggering the next appropriate production actions

The goal is not zero human involvement everywhere.

The goal is:

> Humans make strategic decisions, approve exceptions, and manage relationships. Machines perform repeatable production work.

---

## 2. The Core Factory Model

The factory should be treated as an industrial production system rather than a collection of AI agents.

The high-level flow is:

**Sales and Discovery**

↓

**Client Configuration**

↓

**Strategy and Entity Model**

↓

**Production Planning**

↓

**Asset Manufacturing**

↓

**Deployment**

↓

**Automated QA**

↓

**Human Approval Gates**

↓

**Measurement and ETL**

↓

**Opportunity Detection**

↓

**Continuous Production**

The system should be designed around repeatability, observability, and deterministic inputs.

AI is one component of the factory.

It is not the factory.

---

## 3. The Foundational Principle: The Database-Backed Production Contract

The central design decision is that the portal database is the single source of truth for every client's production configuration.

The production contract is defined as a versioned, machine-validated schema (zod, in `shared/factory/`), and every factory system reads client facts from the portal database — never from ad-hoc files or agent memory.

**Decision (2026-07-07):** an earlier draft of this document made a standalone client YAML file the canonical contract. That role now belongs to the portal database. YAML remains supported only as an import/export serialization — a client configuration can be imported into the database or exported from it, and both directions are validated by the same zod contract schema.

The portal already owns much of the contract today: clients, brands and aliases, competitors, geographies, and analytics integrations (GA4). Factory contract fields reference those rows rather than restating them. Only genuinely new production facts (brand voice, NAP, GBP identifiers, deployment targets, factory approval state) are added as new tables or columns, each arriving with a migration.

Example conceptual structure (shown as YAML for readability; this is the shape of an export, not a canonical file):

```yaml
client:
  name:
  domain:
  phone:
  email:
  logo:
  business_type:
  primary_category:

brand:
  voice:
  colors:
  typography:
  positioning:
  differentiators:

nap:
  business_name:
  address:
  city:
  state:
  postal_code:
  country:

gbp:
  business_type:
  place_id:
  cid:
  primary_category:
  secondary_categories:
  service_areas:

services:
  - name:
    primary_keyword:
    related_entities:
    locations:

locations:
  - city:
    state:
    county:
    geo_coordinates:
    map_embed:
    target_services:

entities:
  people:
  organizations:
  products:
  services:
  locations:
  certifications:
  associations:

analytics:
  ga4_property:
  search_console_property:
  bing_webmaster_tools:
  reporting_sheet:
  looker_studio_report:

deployment:
  wordpress_url:
  publishing_profile:
  schema_profile:
  internal_link_profile:

factory:
  approved:
  production_tier:
  workflow_profile:
  qa_profile:
```

The production contract must be:

* stored in the portal database as the single source of truth
* validated by the shared zod contract schema before production
* auditable (row timestamps plus versioned migrations)
* exportable to and importable from YAML for portability and human review
* extensible only through schema migrations

No agent should invent core business facts when those facts belong in the production contract.

---

## 4. Factory Architecture

The factory should be built as six connected layers.

## Layer 1: Client Data and Knowledge Layer

This contains the authoritative information about the client.

Sources can include:

* client production contract (portal database)
* website crawl data
* Google Business Profile data
* Search Console
* GA4
* Bing Webmaster Tools
* ranking systems
* CRM data
* client documents
* approved brand materials
* reviews
* competitor research
* structured entity research

The purpose of this layer is to establish truth before generation begins.

This is where the factory distinguishes between:

* verified fact
* inferred information
* external evidence
* generated content

That distinction becomes increasingly important for AI search visibility and citation systems.

---

## Layer 2: Strategy and Planning Layer

This layer converts client data into a production plan.

The strategy engine should produce:

### Entity Map

Identify:

* Organization
* LocalBusiness entities
* locations
* services
* products
* people
* credentials
* certifications
* associations
* geographic relationships
* topical relationships

### Search Universe

Build and classify:

* traditional keywords
* local keywords
* service queries
* problem queries
* comparison queries
* informational questions
* People Also Ask opportunities
* AI prompt opportunities
* branded questions
* commercial investigation queries

### Content Architecture

Determine required:

* homepage
* service pages
* product pages
* location pages
* service-area pages
* industry pages
* comparison pages
* case studies
* FAQs
* guides
* supporting content
* entity pages

The output is not immediately published content.

The output is a **production manifest**.

---

## 5. The Production Manifest

The production contract defines the client.

The production manifest defines the work.

For example:

```yaml
production_job:
  client: salvo-metal-works
  job_id: SMW-2027-001

pages:
  service_pages: 7
  product_pages: 62
  location_pages: 12
  faq_sections: 14

schema:
  organization: true
  local_business: true
  service: true
  product: true
  faq_page: true
  breadcrumbs: true

authority_assets:
  google_stack: 1
  cloud_stack: 1
  blogger_post: 2

qa:
  link_check: true
  schema_validation: true
  metadata_validation: true
  indexability_check: true
  visual_check: true
```

This allows the factory to know:

* what must be produced
* what has been completed
* what failed
* what requires approval
* what is blocked
* what must be deployed

This is where the factory starts becoming measurable.

---

## 6. Production Cells

Rather than building one giant autonomous agent, the factory should consist of specialized production cells.

Each production cell should have:

* defined inputs
* defined outputs
* validation rules
* logging
* retry behavior
* escalation rules

## Cell A: Entity Discovery

Purpose:

Create and maintain the client entity model.

Outputs:

* entity registry
* entity relationships
* canonical names
* alternate names
* URLs
* source evidence
* confidence status

This cell supports both site architecture and AI retrieval visibility.

---

## Cell B: Keyword and Prompt Intelligence

Purpose:

Build the complete query opportunity universe.

Outputs:

* keyword clusters
* search intent
* geographic modifiers
* AI prompt opportunities
* PAA questions
* comparison opportunities
* service-location combinations
* prioritization score

The system should not treat traditional rankings as obsolete.

Traditional rankings remain one measurement layer alongside:

* AI citations
* AI mentions
* brand inclusion
* entity retrieval
* referral traffic
* visibility across answer engines

---

## Cell C: Site Architecture

Purpose:

Convert entity and query research into the correct WordPress architecture.

Outputs:

* sitemap
* page hierarchy
* URL patterns
* page types
* internal linking requirements
* canonical relationships
* schema requirements

The architecture should be entity-first rather than simply keyword-first.

---

## Cell D: Content Manufacturing

Purpose:

Produce first-party site content from approved facts and strategic specifications.

Possible outputs:

* service pages
* location pages
* service-area pages
* product descriptions
* FAQs
* comparison pages
* case studies
* educational resources
* GBP posts

Each content type should have its own manufacturing specification.

For example, a location page factory should not simply replace city names in a generic template.

It should incorporate:

* relevant services
* geographic context
* service-area relationships
* local entities
* customer evidence where available
* correct NAP behavior
* appropriate map elements
* correct LocalBusiness or Service schema strategy

---

## Cell E: Schema and Semantic Markup

Purpose:

Generate and deploy structured representations of the entity model.

Responsibilities:

* Organization
* LocalBusiness
* Service
* Product
* Person
* FAQPage
* BreadcrumbList
* CollectionPage
* Article
* Review or AggregateRating where eligible
* relationships between entities

The factory should maintain a schema registry so multiple plugins and systems do not create conflicting entity definitions.

Schema should be generated from authoritative client configuration wherever possible.

---

## Cell F: WordPress Deployment

This is where the RankRocket SEO Control Layer becomes critical.

The long-term goal is to manage WordPress as an API-controlled publishing platform.

Capabilities should include:

* create page
* update page
* update title
* update meta description
* assign focus keyword
* publish schema
* update canonical
* update robots directives
* manage redirects
* update internal links
* publish FAQ data
* update `llms.txt`
* retrieve current SEO state
* compare desired state to actual state

The RankMath REST Bridge is an early component of this control layer.

The larger architecture should become:

**Factory Orchestrator**

↓

**RankRocket SEO Control Layer**

↓

**WordPress**

This separates factory logic from individual WordPress plugins.

---

## Cell G: Google Stack and Authority Asset Production

The existing YACSS Google Stack Agent project is one of the first true factory production cells.

Its workflow should eventually become:

1. validate client configuration
2. retrieve approved content
3. generate asset plan
4. generate Docs
5. generate Sheets
6. generate Slides
7. generate Blogger content
8. establish entity-consistent linking
9. publish
10. collect URLs
11. validate URLs
12. run incognito checks
13. update tracking database
14. mark job complete

This same architecture can support:

* cloud stacks
* structured citation assets
* hosted entity documents
* supporting content assets

The goal is no longer merely creating backlinks.

The stronger future model is creating a distributed, entity-consistent evidence layer.

---

## 7. The Factory Orchestrator

The orchestrator controls the entire production process.

It should not itself perform every task.

Its job is to:

* read the client configuration from the portal database
* validate configuration
* create jobs
* assign jobs to production cells
* monitor job status
* collect outputs
* enforce QA gates
* retry failures
* escalate exceptions
* authorize deployment
* update production state

Conceptually:

```text
CLIENT CONFIG (PORTAL DB)
     |
     v
VALIDATOR
     |
     v
STRATEGY ENGINE
     |
     v
PRODUCTION MANIFEST
     |
     v
ORCHESTRATOR
     |
     +--> ENTITY CELL
     |
     +--> CONTENT CELL
     |
     +--> SCHEMA CELL
     |
     +--> WORDPRESS CELL
     |
     +--> GOOGLE STACK CELL
     |
     +--> REPORTING CELL
     |
     v
QA GATE
     |
     v
DEPLOYMENT
```

The orchestrator needs persistent job state.

A production job should never disappear because an AI conversation ended.

---

## 8. Human Approval Gates

Lights-out production does not mean blind publishing.

The factory should have explicit gates.

## Gate 1: Client Truth Approval

Approve:

* NAP
* services
* service areas
* credentials
* claims
* differentiators
* business categories

Nothing proceeds until required business facts are validated.

---

## Gate 2: Strategy Approval

Approve:

* site architecture
* primary entities
* keyword universe
* target locations
* page production plan

Once approved, mass production can begin.

---

## Gate 3: Sample Approval

Before large batch production, review representative samples.

For example:

* one service page
* one location page
* one product page
* one FAQ section
* one Google Stack

Once a template family is approved, the factory may proceed with the batch.

---

## Gate 4: Deployment Approval

Automated QA must pass before production deployment.

Human involvement should be exception-based.

Green jobs continue.

Yellow jobs require review.

Red jobs stop.

---

## 9. QA Must Be a Separate System

The system that creates an asset should not be the only system responsible for validating it.

QA should include deterministic checks wherever possible.

## Content QA

Check:

* missing headings
* duplicate sections
* placeholder content
* incorrect client names
* incorrect locations
* unsupported claims
* excessive similarity
* missing internal links

## Technical QA

Check:

* status codes
* canonical URLs
* redirects
* noindex state
* metadata
* headings
* schema presence
* duplicate schema
* broken links
* image attributes
* sitemap inclusion

## Structured Data QA

Check:

* JSON validity
* schema requirements
* entity consistency
* NAP consistency
* identifiers
* URL consistency
* relationship integrity

## Publishing QA

Check:

* asset exists publicly
* expected URL resolves
* page displays correctly
* content matches approved artifact
* links work
* asset appears without authentication
* incognito validation passes

---

## 10. Reporting and ETL Factory

The reporting system is another factory production line.

The progression we previously discussed is:

## Stage 1: Development and Testing

Manual inputs are acceptable while data definitions are established.

Goal:

Determine exactly what should be measured.

---

## Stage 2: Early Production

Automate collection where APIs are available.

Keep manual steps only where required by desktop-only systems such as SEO PowerSuite.

---

## Stage 3: Full Production

Automate:

* client reporting Sheet creation
* GA4 extraction
* Search Console extraction
* Bing data extraction
* rank data import
* transformation
* validation
* metric calculation
* Looker Studio source updates

---

## Stage 4: The Dream State

The client configuration is approved.

The reporting agent:

1. validates the reporting configuration
2. checks data source availability
3. extracts current data
4. performs ETL
5. validates row counts and date ranges
6. detects anomalies
7. updates reporting tables
8. refreshes Looker Studio data
9. produces an executive summary
10. creates an opportunity queue for the production factory

Reporting then stops being a retrospective document.

It becomes an input to production.

---

## 11. The Feedback Loop

This is the part that turns automation into a real factory.

The factory should continuously compare:

**Desired State**

against

**Actual State**

Examples:

### Desired State

A target service has:

* a primary page
* a supporting FAQ cluster
* three internal supporting pages
* correct schema
* ten high-value internal links
* Google Stack support
* citations across target AI systems

### Actual State

The system detects:

* weak ranking trend
* no ChatGPT citations
* declining impressions
* missing supporting content
* weak internal linking
* new competitor entity coverage

The factory then creates recommended production jobs.

For example:

```text
Opportunity detected:
Commercial roof repair visibility declining

Recommended jobs:
- expand service page evidence
- create three supporting problem pages
- add project case study
- strengthen internal linking
- update entity references
- create citation-support asset
```

At first, a human approves the jobs.

Eventually, low-risk work classes can run automatically.

---

## 12. The LightAgency Operating Model

The agency should eventually operate through three levels.

## Level 1: Human Strategy

Humans handle:

* client relationships
* positioning
* business judgment
* competitive strategy
* prioritization
* exception handling
* final strategic approval

---

## Level 2: Factory Supervision

A smaller amount of human attention manages:

* job queue
* exceptions
* failed QA
* strategic approvals
* unusual technical issues

---

## Level 3: Automated Production

Machines handle repeatable:

* research collection
* clustering
* page manufacturing
* schema production
* WordPress updates
* authority asset creation
* validation
* reporting ETL
* opportunity detection

This changes the agency from:

**people doing work with software**

into:

**people directing a production system**

---

## 13. Recommended Technical Architecture

The practical architecture should be modular.

```text
CLIENT CONFIGURATION
PORTAL DATABASE (YAML import/export)
        |
        v
VALIDATION ENGINE
        |
        v
STRATEGY ENGINE
        |
        v
PRODUCTION MANIFEST
        |
        v
JOB QUEUE / ORCHESTRATOR
        |
        +--------------------------+
        |             |            |
        v             v            v
CONTENT CELL     SCHEMA CELL   ENTITY CELL
        |             |            |
        +-------------+------------+
                      |
                      v
              DEPLOYMENT LAYER
                      |
          +-----------+-----------+
          |                       |
          v                       v
   WORDPRESS CONTROL        AUTHORITY ASSETS
        LAYER                  STACK AGENTS
          |                       |
          v                       v
      WORDPRESS             GOOGLE / CLOUD
          |
          v
      QA SYSTEM
          |
          v
   REPORTING / ETL
          |
          v
 OPPORTUNITY DETECTION
          |
          v
      JOB QUEUE
```

---

## 14. Build Sequence

Trying to automate everything simultaneously would create a giant brittle system.

The correct approach is to build working factory cells and then connect them.

## Phase 1: Establish the Factory Standard

Build:

* canonical client production-contract schema in the portal database (Drizzle + zod)
* Factory Job Contract v1 validator — DONE 2026-07-07 (`shared/factory/job-contract.ts`)
* production job persistence — DONE 2026-07-07 (`factory_jobs` table + `FactoryJobStore`)
* job status definitions — DONE 2026-07-07 (`FACTORY_JOB_STATUSES` in `shared/schema.ts`)
* production manifest schema
* QA severity definitions
* standard output folders
* production logging conventions

This is the foundation.

---

## Phase 2: Complete Existing Production Cells

Finish and productionize:

### YACSS Google Stack Agent

Complete:

* configuration validation
* production workflow
* URL logging
* QA
* publish gating
* status tracking

### RankRocket SEO Control Layer

Expand:

* RankMath REST Bridge
* WordPress metadata control
* schema control
* robots control
* redirect control
* `llms.txt`
* state retrieval
* desired-state versus actual-state comparison

---

## Phase 3: Build the WordPress Site Factory

Create standardized production workflows for:

* site architecture
* service pages
* location pages
* product pages
* FAQ content
* entity relationships
* internal linking
* metadata
* schema

The deliverable is an AI-search-ready WordPress entity publishing system, not merely a website.

---

## Phase 4: Build Reporting ETL

Create an automated reporting pipeline around:

* GA4
* Google Search Console
* Bing Webmaster Tools
* ranking data
* AI visibility tracking
* referral traffic
* conversion events

Where APIs do not exist, create controlled ingestion methods rather than trying to reverse-engineer unstable binary data stores.

---

## Phase 5: Connect Reporting to Production

Create the opportunity engine.

It should detect:

* ranking opportunity
* declining visibility
* page-two keywords
* entity gaps
* weak service coverage
* location gaps
* internal link gaps
* missing schema relationships
* AI citation gaps
* competitor coverage gaps

Output:

**prioritized production jobs**

---

## Phase 6: Introduce Increasing Autonomy

Production jobs should be grouped by risk.

### Green Jobs

Can eventually execute automatically.

Examples:

* metadata corrections
* broken internal link repair
* missing image attribute correction
* reporting ETL
* known-schema repairs
* tracking updates

### Yellow Jobs

Generate automatically but require approval.

Examples:

* FAQ additions
* content updates
* new internal links
* page expansion
* schema relationship changes

### Red Jobs

Require human strategy and explicit approval.

Examples:

* new service positioning
* major site architecture changes
* new city expansion
* major business claims
* brand positioning
* destructive content removal

This is the safest path toward lights-out production.

---

## 15. Factory KPIs

The factory itself needs operational measurements.

Track:

## Production

* jobs created
* jobs completed
* jobs failed
* average cycle time
* retry rate
* manual intervention rate
* QA rejection rate

## Efficiency

* production hours per client
* human review minutes per job
* cost per published page
* cost per production asset
* monthly production capacity

## Quality

* schema error rate
* publishing defect rate
* broken-link rate
* factual correction rate
* duplicate-content detection rate

## Business Outcome

* organic visibility
* AI citation visibility
* brand mentions
* search impressions
* qualified organic sessions
* calls
* forms
* booked appointments
* revenue contribution

The ultimate factory KPI is not content volume.

It is:

> **How much measurable client growth can the agency generate per unit of human production time?**

---

## 16. What the 2027 LightAgency Should Look Like

A mature workflow could look like this:

### Monday Morning

The owner opens the factory dashboard.

It shows:

* 8 client reporting cycles completed
* 3 technical issues automatically repaired
* 14 content opportunities detected
* 6 low-risk updates automatically deployed
* 4 new content jobs awaiting strategy approval
* 1 Google Stack failed QA and is held from deployment
* 2 client visibility declines requiring investigation

The operator is not:

* copying ranking data
* manually creating reporting sheets
* pasting meta descriptions
* injecting schema page by page
* hand-building repetitive location pages
* checking every URL manually
* assembling monthly reports manually

The human role becomes:

**decide, approve, investigate, improve.**

The machine role becomes:

**collect, manufacture, deploy, validate, measure, repeat.**

---

## 17. The North Star

The final LightAgency factory should work like this:

```text
CLIENT DATA
     ↓
APPROVED STRATEGY
     ↓
MACHINE-READABLE PRODUCTION CONTRACT
     ↓
AUTOMATED PRODUCTION
     ↓
AUTOMATED QA
     ↓
CONTROLLED DEPLOYMENT
     ↓
AUTOMATED MEASUREMENT
     ↓
OPPORTUNITY DETECTION
     ↓
NEXT PRODUCTION CYCLE
```

The destination is not a magic AI agent that runs an agency.

The destination is more powerful and more realistic:

> A carefully engineered SEO/AEO/GEO production system where AI agents, deterministic software, APIs, QA systems, and human judgment each perform the jobs they are best suited to perform.

That is the Lights-Out SEO Factory.
