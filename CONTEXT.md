# Yes Chef

A single-user cooking companion for browsing cookbooks, scaling recipes to the table, and guiding cooking step by step.

## Language

### Recipes

**Recipe**:
A set of ingredients and ordered steps that produces a dish.
_Avoid_: dish, item, doc, document

**Ingredient**:
A single component of a recipe with a name, amount, and unit.
_Avoid_: item, product

**Step**:
One ordered instruction within a recipe.
_Avoid_: instruction, stage, card

**Step Timer**:
A duration attached to a step, such as simmering or resting.
_Avoid_: timer

**Timing**:
The stated preparation, cooking, and total times for a recipe.
_Avoid_: duration, time

**Tag**:
A plain label for diet or meal type used to filter recipes.
_Avoid_: label, chip, filter, category

**Source**:
The named publication and link a recipe came from.
_Avoid_: link, URL, publication

### Servings

**Base Servings**:
The serving count all ingredient amounts are written against.
_Avoid_: servings, count, value

**Target Servings**:
The serving count chosen for this cooking occasion, used to scale amounts.
_Avoid_: servings, count, value

### Cooking

**Preparation**:
The ingredient checklist completed before the first step.
_Avoid_: prep, Step 0

**Cooking Mode**:
The guided, step-by-step cooking flow for one recipe.
_Avoid_: cook view, cooking view, session

**Active Step**:
The first not-yet-done step, the current focus of cooking.
_Avoid_: current, selected, next-up

**Done**:
A step or timer marked as finished by the cook.
_Avoid_: completed, checked, finished

**Runtime Timer**:
A live countdown started from a step timer during cooking.
_Avoid_: timer

**Timer Tray**:
The persistent bar showing all running and finished countdowns.
_Avoid_: tray, timer list

**Dismiss**:
Removing a finished countdown from the tray.
_Avoid_: cancel, close, remove

**Cancel**:
Stopping a running countdown before it finishes.
_Avoid_: dismiss, close, remove

### Collections

**Cookbook**:
A named collection of recipes shared as one set.
_Avoid_: collection

**Cookbook Code**:
The secret string that unlocks one cookbook.
_Avoid_: collection key, cookbook key, secret code, token, password

**Browse**:
Listing recipes in a cookbook filtered to those matching all selected tags.
_Avoid_: list, grid, home, search view

**Detail**:
The single-recipe overview with ingredients, steps preview, and cooking entry.
_Avoid_: recipe view, preview
