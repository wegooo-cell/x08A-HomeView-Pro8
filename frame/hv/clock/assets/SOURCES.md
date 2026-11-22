# Sources

- Clock structure and visual reference: Apple iPad User Guide, world clock / timers. https://support.apple.com/zh-cn/guide/ipad/ipadeb537641/ipados and https://support.apple.com/zh-cn/guide/ipad/ipad8c2100d1/ipados . Reference screenshots are QA material; Apple screenshots are not embedded as app UI.
- land-110m.json: world-atlas 2.0.2, https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json ; source https://github.com/topojson/world-atlas . ISC license in world-atlas-LICENSE.txt.
- Geographic source: Natural Earth, public domain, https://www.naturalearthdata.com/about/terms-of-use/ . The app renders this data as a functional city/time-zone map using Canvas, with no network request after the local asset loads. Day/night shading is a visual approximation, not an astronomy service.
- UI icons reuse the existing Ionicons library in desktop/assets and app-ui/assets with their existing license. Clock dials, stopwatch digits, timer progress and form controls are functional UI, not raster artwork. No new illustrative image asset is needed.

- Geographic rendering: d3-array 1.2.4 and d3-geo 1.12.1 (ES5 builds), Mike Bostock / D3 contributors. BSD-3-Clause licenses bundled as d3-array-LICENSE.txt and d3-geo-LICENSE.txt. Used for geographic projection and antimeridian clipping only; no external runtime request. https://github.com/d3/d3-geo/tree/v1.12.1 and https://github.com/d3/d3-array/tree/v1.2.4 .
