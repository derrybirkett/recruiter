## Reimagining Candidate Search for the Age of AI

**How should natural-language prompting and structured filters work together for corporate recruiters?**

---

## Context

You’re designing **search** for a large professional network (think “LinkedIn-like”).

Corporate recruiters:

- Describe candidates in **plain language**
- Refine results with **structured filters** (title, skills, location, seniority, etc.)

Today, they struggle with:

- Result sets that are too large or too vague
- The need for **granular location control** (country → state → city)
- Uncertainty about what belongs in the **prompt vs. filters**
- Confusion when prompt and filters **overlap or conflict**

Your challenge is to design a **simple, fast interaction model** that lets recruiters use a typed description and filters **together**, while staying clear about:

- What is applied
- How it can be changed
- Why specific candidates appear

---

## Target User

- **Corporate recruiter** sourcing candidates for open roles
- Works primarily on **desktop**
- Keyboard-friendly and responsive by default

---

## Goals

Your solution should:

1. Make it **obvious what’s applied** at any moment—and how to edit or remove it.
2. Show how **prompt + filters** work together without duplication or confusion.
3. Provide **lightweight explainability** (“why does this candidate appear?”).
4. Help recruiters **tighten or relax** results iteratively with minimal effort.

> Focus on interaction and UX, not backend systems or ML architecture.
> 

---

## Constraints

- Assume the prompt capability is **imperfect but useful**:
    - It can surface suggestions or inferred attributes
    - Users must be able to **confirm, edit, or dismiss** them easily
- Avoid maps and heavy data visualizations
    - List + detail patterns are sufficient

---

## Inputs (for inspiration only)

### Example recruiter prompts

- “Looking for a senior backend engineer with strong Python experience in Berlin for an AI-native startup; open to EU-remote.”
- “Hiring a Head of Sales in fintech, fluent in Spanish and English, based in the Mexico City area.”
- “Seeking a senior healthcare data scientist with MLOps experience in the Bay Area with at least 5 years of experience.”

### Available filter concepts (labels only)

- Title(s)
- Skills
- Years of experience
- Location (country / state / city)
- Work preference (on-site / hybrid / remote)
- Industry
- Languages
- Last active

---

## Your Assignment (3–4 hours, low-fidelity encouraged)

### 1. Interaction model

Show how a recruiter:

- Enters a natural-language prompt
- Combines it with structured filters
- Understands how both influence results

### 2. Applied state & editability

Design a clear, always-visible applied state that:

- Shows current intent and rules
- Is easy to scan
- Allows quick add / edit / remove actions

### 3. Conflicts & clarity

Demonstrate how the UI:

- Detects contradictions (e.g. prompt says “remote”, filter says “on-site”)
- Communicates them clearly
- Resolves them respectfully, keeping user intent in control

### 4. Explainability

Provide a compact “**why this candidate**” pattern tied directly to:

- The prompt
- The active filters

### 5. Iteration over edge cases

Show how users recover from:

- **Zero-result** states
- **Overly broad** result sets

Use gentle, low-friction guidance.

---

## Deliverables

AI-generated sketches and wireframes are welcome. Use any tool you prefer.

Please submit **one shareable link** (Figma, Penpot, Framer, Lovable, or similar) **and/or a PDF**.

### Include:

### 1. One-page brief (bullets are fine)

- Key assumptions
- Problem framing
- Design principles
- What “good” looks like for this flow

### 2. Up to 6 annotated wireframes

Covering:

1. Start state (empty or last search)
2. Prompt entry with unobtrusive guidance
3. Filter add/edit (including hierarchical geography)
4. Clear applied-state view (what’s on; quick edit/remove)
5. Conflict or clarification moment (your simplest viable pattern)
6. Results view with a compact “why this candidate” affordance

---

## Evaluation Criteria

We’ll assess:

- **Clarity of mental model**
    
    Prompt vs. filters feel intuitive and complementary.
    
- **Simplicity & speed**
    
    Few steps to reach a tight, relevant result set.
    
- **Information structure**
    
    Applied state remains compact and scannable.
    
- **Communication**
    
    Clear rationale and concise annotations.
    
- **Pragmatism**
    
    Sensible scope cuts and a believable MVP.
    

---