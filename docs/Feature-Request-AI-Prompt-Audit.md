New Feature Request 02 - Create a mechanism to audit the prompt collection for a client.

## 1. Audit Criteria for AI Visibility Prompt Collections

When auditing a collection of prompts designed for AI tracking, evaluate them across four primary dimensions:

### A. Intent Diversity & Funnel Coverage

AI tools interact differently depending on the stage of the user journey. A balanced collection should span all stages:

* **Informational / TOFU (Top of Funnel):** Broad topic queries (e.g., *"How to handle..."*).
* **Comparative / MOFU (Middle of Funnel):** Head-to-head or category considerations (e.g., *"Brand A vs. Brand B"*).
* **Commercial & Transactional / BOFU (Bottom of Funnel):** High-intent buying/renting queries (e.g., *"Where to buy..."*, *"Affordable options for..."*).
* **Local Intent:** Location-constrained service queries (e.g., *"Restroom rental in [City]"*).

### B. Natural Conversational Phrasing (Fan-Out & Context)

Traditional SEO relies on short keywords, but AI search relies on natural language, situational context, and multi-turn scenarios.

* Do the prompts sound like real user inquiries (using full sentences and natural phrasing)?
* Do they include contextual constraints (e.g., constraints by budget, event type, or specific pain points)?

### C. Bias & Entity Over-Reliance

* **Non-Branded vs. Branded Ratio:** Tracking only queries that explicitly contain your brand name (*"Linkon Logs"*) distorts your score. If your brand is in the prompt, AI models almost always mention you. To measure true AI discovery, most prompts must be **non-branded / category-level** to see if the AI recommends you organically.

### D. Geographic & Contextual Granularity

* Does the prompt collection test variations across different geographic markets, or does it leave location implied/vague?

---

## 2. Audit of the "Linkon Logs" Collection

Reviewing the 12 prompts currently in the **Linkon Logs** workflow:

1. *What are the benefits of portable restroom rentals?*
2. *Linkon Logs Portables vs Perfect Potty Inc: Which offers better value?*
3. *Where to buy the best portable restrooms online?*
4. *Portable restroom rental in San Francisco*
5. *How to handle restroom needs at outdoor events?*
6. *Alternatives to Perfect Potty Inc for restroom rentals*
7. *What features should I look for in a portable restroom?*
8. *Is Linkon Logs Portables a good choice for weddings?*
9. *Affordable portable restroom units for sale*
10. *Best portable restroom service in Los Angeles*
11. *Why are portable restrooms essential for construction sites?*
12. *Other companies like Perfect Potty Inc*

### Audit Findings for Linkon Logs:

* **The Good:** Good intent tag variety (Informational, Comparative, Commercial, Local, Alternative). Good geographic representation (SF and LA).
* **The Gaps:**
1. **Heavy Branded Bias:** Out of 12 prompts, **4 explicitly mention Linkon Logs or direct competitors** by name (e.g., *Perfect Potty Inc*). This artificial seeding skews baseline discovery metrics.
2. **Lack of Persona / Situational Context:** Queries like *"Portable restroom rental in San Francisco"* look like traditional keyword queries copy-pasted into a prompt list. AI users ask detailed, context-rich questions (e.g., *"I'm planning a 200-person outdoor wedding in San Francisco. How many portable restrooms do I need and who provides luxury trailers?"*).
3. **Missing Follow-Up / Multi-Turn Trajectories:** All prompts are single-shot isolated questions.



---

## 3. Actionable Recommendations for Linkon Logs

If this collection is determined to be inadequate, implement these three structural fixes:

### Recommendation 1: Rebalance the Branded vs. Unbranded Ratio

Separate your prompt collection into two distinct tracking buckets:

* **Organic Category Prompts (70–80% of collection):** Remove brand names so you can track whether AI models include Linkon Logs in organic recommendations.
* **Brand Evaluation / Sentiment Prompts (20–30% of collection):** Keep branded queries in a separate tag to evaluate how AI models frame your brand positioning and sentiment when asked directly.

### Recommendation 2: Transition from "Keywords" to "Persona-Based Context Prompts"

Rewrite short, generic queries into realistic, context-heavy AI prompts:

| Current Prompt (Keyword Style) | Recommended Actionable AI Prompt |
| --- | --- |
| *Portable restroom rental in San Francisco* | *"I need to rent high-end portable restrooms for a 3-day outdoor event in San Francisco. What local rental services have good reviews and reliable delivery?"* |
| *How to handle restroom needs at outdoor events?* | *"What is the standard ratio of portable restrooms to guests for a 500-person music festival, and which suppliers service northern California?"* |
| *Affordable portable restroom units for sale* | *"What are the most reliable and affordable commercial portable restroom units available for purchase for a job site?"* |

### Recommendation 3: Expand Use-Case & B2B Vertical Coverage

Add prompts targeting specific high-value customer verticals (e.g., commercial construction, luxury weddings, agriculture, disaster relief).

* **Construction Vertical:** *"What are OSHA requirements for portable toilets on commercial job sites in California, and which vendors provide weekly servicing?"*
* **Event Planning Vertical:** *"What are the top luxury restroom trailer rental companies for upscale vineyard weddings in Napa/Sonoma?"*