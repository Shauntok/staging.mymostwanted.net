# Malaysia state and federal territory boundaries

The interactive map paths in `lib/maps/malaysia-states.ts` are derived from the simplified geoBoundaries ADM1 GeoJSON for Malaysia (`MYS`, 16 administrative units), boundary year 2019. The 16 features are kept separate so each state or federal territory can be selected. The boundary coordinates are adapted to an SVG map projection, and the source spellings `Kedeh` and `Negeri` are presented as `Kedah` and `Negeri Sembilan` respectively. Singapore is a separate map area, not part of the Malaysian state list.

- Dataset: geoBoundaries, Humanitarian (`gbHumanitarian`), Malaysia ADM1
- Upstream source: UNHCR / Humanitarian Data Exchange (HDX)
- License: Creative Commons Attribution 3.0 Intergovernmental Organisations (CC BY 3.0 IGO)
- Dataset metadata: https://www.geoboundaries.org/api/current/gbHumanitarian/MYS/ADM1/
- Dataset file: https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbHumanitarian/MYS/ADM1/geoBoundaries-MYS-ADM1_simplified.geojson
- Upstream UNHCR / HDX record: https://data.humdata.org/dataset/cod-ab-mys
- License text: https://creativecommons.org/licenses/by/3.0/igo/

The map displays the geoBoundaries name with a link, the upstream source, license, and an indication that boundaries and labels were adapted. The credit is in a compact expandable map-credit control so it remains available without covering the map. These generalized 2019 boundaries are for map orientation only, not an authoritative legal source. The home map remains a State-outline browse surface and does not place post counts or pins on those outlines; District lines, counts, and post previews are a separate Areas-page feature.

## Malaysia District boundaries

The District overlays use the pinned geoBoundaries open MYS ADM2 simplified GeoJSON at commit `9469f09` (boundary year 2020). The MYS ADM2 API lists City Population (`citypopulation.de`) as a source and its dataset-specific `boundaryLicense` field says CC BY 3.0; the API documentation defines that field as the original source license. The file contains 159 features although its metadata reports 160 administrative units. Comparison with the source directory identifies the missing feature as Putrajaya. By product decision, the former Putrajaya region is folded into Kuala Lumpur in the public map and public region counts. The existing Putrajaya ADM1 outline is retained as part of the composite Kuala Lumpur map shape; the ADM2 file has no independent Putrajaya District boundary, and none is fabricated. Its source area/post IDs remain available internally. The geometry named `Ledang` is labeled `Tangkak` to match the current source directory. This credit records the upstream metadata and links; it is not a legal determination about City Population's terms for this particular file.

- Dataset metadata: https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM2/
- Pinned dataset file: https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/MYS/ADM2/geoBoundaries-MYS-ADM2_simplified.geojson
- Source directory: https://www.citypopulation.de/en/malaysia/admin/
- License text: https://creativecommons.org/licenses/by/3.0/

The overlay is an adapted, clipped SVG rendering for region browsing. It is not an authoritative cadastral/legal boundary and does not add the missing Putrajaya polygon. Migration `20261005100000_mys_district_map_and_putrajaya_merge.sql` is applied to the local Supabase database; the local District catalog and Kuala Lumpur aggregation are covered by pgTAP. Hosted/Staging application and public-post UI verification remain outstanding.

## Singapore

The Singapore outline in `lib/maps/singapore.ts` is adapted from the geoBoundaries Singapore ADM0 simplified GeoJSON. Its source boundary is attributed to the Urban Redevelopment Authority; geoBoundaries reports a boundary year of 2016 and ODbL 1.0 licensing. The outline is simplified and positioned as a separate selectable map area.

- Dataset metadata: https://www.geoboundaries.org/api/current/gbOpen/SGP/ADM0/
- Upstream source dataset: https://data.gov.sg/dataset/master-plan-2014-subzone-boundary-no-sea
- License text: https://opendatacommons.org/licenses/odbl/1-0/
