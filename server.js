const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// Enable trust proxy
app.set('trust proxy', 1);

// ── Load data ────────────────────────────────────────────────────────────────
const catalogFile = path.join(__dirname, 'laskers-ring-catalog.json');
const fallbackFile = path.join(__dirname, 'laskers_complete_data.json');
const dataPath = fs.existsSync(catalogFile) ? catalogFile : fallbackFile;

console.log(`Loading dataset from: ${path.basename(dataPath)}`);
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ── Helper: metal + color → label ───────────────────────────────────────────
function getMetalString(metal, color) {
  const c = (color || '').toLowerCase();
  const m = (metal || '').toLowerCase();
  if (m.includes('14k') || m.includes('14kt') || m.includes('14 karat')) {
    if (c.includes('white')) return '14k White Gold';
    if (c.includes('yellow')) return '14k Yellow Gold';
    if (c.includes('rose') || c.includes('pink')) return '14k Rose Gold';
    return '14k White Gold';
  }
  if (m.includes('18k') || m.includes('18kt') || m.includes('18 karat')) {
    if (c.includes('white')) return '18k White Gold';
    if (c.includes('yellow')) return '18k Yellow Gold';
    if (c.includes('rose') || c.includes('pink')) return '18k Rose Gold';
    return '18k White Gold';
  }
  if (m.includes('platinum') || c.includes('platinum')) return 'Platinum';
  if (c.includes('white')) return '14k White Gold';
  if (c.includes('yellow')) return '14k Yellow Gold';
  if (c.includes('rose') || c.includes('pink')) return '14k Rose Gold';
  return '14k White Gold';
}

// ── Pre-process catalog data (Direct original CloudFront URLs) ────────────────
console.log('Processing JSON data for API...');
const settingsResults = [];

if (rawData.ring_groups) {
  for (const [groupId, group] of Object.entries(rawData.ring_groups)) {
    const rings = group.rings || [];
    if (rings.length === 0) continue;

    const firstRing = rings[0];
    const shapes = group.compatibleShapes && group.compatibleShapes.length > 0
      ? group.compatibleShapes
      : Array.from(new Set(rings.map(r => r.defaultShape).filter(Boolean)));

    let minCarat = Infinity;
    let maxCarat = 0;
    rings.forEach(r => {
      if (r.setWithMin !== undefined) minCarat = Math.min(minCarat, r.setWithMin);
      if (r.setWithMax !== undefined) maxCarat = Math.max(maxCarat, r.setWithMax);
    });
    if (minCarat === Infinity) minCarat = 0.5;
    if (maxCarat === 0) maxCarat = 3.0;

    const metalMap = {};
    for (const r of rings) {
      const metalStr = getMetalString(r.metal, r.color);
      if (!metalMap[metalStr]) {
        metalMap[metalStr] = {
          metal: metalStr,
          priceCents: (r.price || group.minPrice || 1000) * 100,
          images: {}
        };
      }
      if (r.defaultShape) {
        // Direct original CloudFront CDN PNG URLs
        metalMap[metalStr].images[r.defaultShape.toLowerCase()] = {
          images: r.images || [],
          hoverImage: r.hoverImage || ''
        };
      }
    }

    const title = group.title || firstRing.name
      .replace(/ - \d+K.*Gold/i, '')
      .replace(/ - Platinum/i, '')
      .trim() || firstRing.name;
    const style = Array.isArray(group.style)
      ? group.style.join(', ')
      : (group.style || (Array.isArray(firstRing.style) ? firstRing.style.join(', ') : 'Solitaire'));

    settingsResults.push({
      id: groupId,
      slug: groupId,
      title,
      style,
      description: group.description || '',
      specifications: group.specifications || {},
      minPrice: group.minPrice || 1000,
      maxPrice: group.maxPrice || 5000,
      basePriceCents: (group.minPrice || firstRing.price || 1000) * 100,
      compatibleShapes: shapes,
      metalOptions: Object.values(metalMap)
    });
  }
}
console.log(`Pre-processed ${settingsResults.length} ring groups successfully.`);

// ── API routes ───────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { style, metal, shape } = req.query;

  let filtered = settingsResults;
  if (style) filtered = filtered.filter(s => s.style.toLowerCase().includes(style.toLowerCase()));
  if (metal) filtered = filtered.filter(s => s.metalOptions.some(m => m.metal.toLowerCase().includes(metal.toLowerCase())));
  if (shape) filtered = filtered.filter(s => s.compatibleShapes.some(sh => sh.toLowerCase() === shape.toLowerCase()));

  res.json({ total: filtered.length, results: filtered });
});

app.get('/api/diamonds', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { setting_id, stone_type, shape } = req.query;
  const sType = (stone_type && stone_type !== 'undefined') ? stone_type : 'Natural';

  const setting = settingsResults.find(s => s.id == setting_id) || settingsResults[0];
  const targetShapes = setting ? setting.compatibleShapes : ['round'];
  const selShape = (shape && targetShapes.includes(shape.toLowerCase())) ? shape.toLowerCase() : (targetShapes[0] || 'round');

  const formattedShape = selShape.charAt(0).toUpperCase() + selShape.slice(1);
  const isLab = sType.toLowerCase().includes('lab');
  const priceMult = isLab ? 0.45 : 1.0;

  const diamonds = [
    // LUXURY Tier
    { id: 'd-lux-1', shape: formattedShape, carat: 2.0, color: 'D', clarity: 'VVS1', cut: 'Ideal',     stoneType: sType, priceCents: Math.round(507000 * priceMult) },
    { id: 'd-lux-2', shape: formattedShape, carat: 1.5, color: 'E', clarity: 'VVS1', cut: 'Ideal',     stoneType: sType, priceCents: Math.round(315000 * priceMult) },
    { id: 'd-lux-3', shape: formattedShape, carat: 1.5, color: 'D', clarity: 'VVS2', cut: 'Excellent', stoneType: sType, priceCents: Math.round(307700 * priceMult) },
    // CLASSIC Tier
    { id: 'd-cls-1', shape: formattedShape, carat: 1.0, color: 'F', clarity: 'VS1',  cut: 'Ideal',     stoneType: sType, priceCents: Math.round(243100 * priceMult) },
    { id: 'd-cls-2', shape: formattedShape, carat: 1.0, color: 'G', clarity: 'VS1',  cut: 'Excellent', stoneType: sType, priceCents: Math.round(198000 * priceMult) },
    { id: 'd-cls-3', shape: formattedShape, carat: 0.9, color: 'E', clarity: 'VS2',  cut: 'Ideal',     stoneType: sType, priceCents: Math.round(153500 * priceMult) },
    // AFFORDABLE Tier
    { id: 'd-aff-1', shape: formattedShape, carat: 0.75, color: 'G', clarity: 'VS2', cut: 'Excellent', stoneType: sType, priceCents: Math.round(125000 * priceMult) },
    { id: 'd-aff-2', shape: formattedShape, carat: 0.5,  color: 'H', clarity: 'VS2', cut: 'Excellent', stoneType: sType, priceCents: Math.round(95000  * priceMult) },
    { id: 'd-aff-3', shape: formattedShape, carat: 0.5,  color: 'F', clarity: 'SI1', cut: 'Ideal',     stoneType: sType, priceCents: Math.round(79400  * priceMult) }
  ];

  res.json({ total: diamonds.length, results: diamonds });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mock Supplier API running on port ${PORT}`);
});
