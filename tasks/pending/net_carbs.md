function normalizeCarbs(product):

carbs = product.nutriments.carbohydrates
fiber = product.nutriments.fiber
polyols = product.nutriments.polyols || product.nutriments["sugar-alcohols"]
countries = product.countries_tags || []

assumptions = []
confidence = "low"

# --- Step 0: sanity check ---

if carbs is null:
return { net_carbs: null, confidence: "low", assumptions: ["missing carbs"] }

# normalize missing values

fiber = fiber ?? 0
polyols = polyols ?? 0

# --- Step 1: detect labeling regime ---

isUS = countries contains any of ["en:united-states", "en:canada"]
isEU = countries contains any EU country tag

regime = "unknown"

if isUS and not isEU:
regime = "US"
confidence = "high"
assumptions.push("US labeling → carbs include fiber")

else if isEU and not isUS:
regime = "EU"
confidence = "high"
assumptions.push("EU labeling → carbs exclude fiber")

else if isUS and isEU:
regime = "mixed"
confidence = "medium"
assumptions.push("multi-country product (US + EU)")

else:
regime = "unknown"
assumptions.push("no reliable country info")

# --- Step 2: detect inconsistencies ---

if fiber > carbs:
assumptions.push("fiber > carbs → carbs likely exclude fiber (EU-style)")
regime = "EU"
confidence = "medium"

if polyols > carbs:
assumptions.push("polyols > carbs → data inconsistent")
confidence = "low"

# --- Step 3: compute net carbs ---

if regime == "US":
net = carbs - fiber - polyols

else if regime == "EU":
# fiber already excluded
net = carbs - polyols

else if regime == "mixed":
# compute both and pick safer estimate
net_us = carbs - fiber - polyols
net_eu = carbs - polyols

```
  # choose the LOWER value (conservative for keto users)
  net = min(net_us, net_eu)
  assumptions.push("used conservative min(US, EU)")
```

else:
# unknown → fallback heuristic
net_guess_us = carbs - fiber - polyols
net_guess_eu = carbs - polyols

```
  # if fiber is significant, assume US-style
  if fiber > 0.5:
      net = net_guess_us
      assumptions.push("fiber present → assumed US-style")
  else:
      net = net_guess_eu
      assumptions.push("low fiber → assumed EU-style")

  confidence = "low"
```

# --- Step 4: clamp values ---

if net < 0:
net = 0
assumptions.push("clamped negative to 0")

return {
net_carbs: round(net, 2),
confidence: confidence,
assumptions: assumptions
}

