# MMWR 马来西亚 State → City/行政区边界来源复核

复核日期：2026-09-29  
范围：记录地图下钻所需的马来西亚第二级行政区边界来源、许可和目录映射。开头的 2026-09-29 记录是初始评估；用户后续明确选择了 159 条 geoBoundaries ADM2 并授权在本地实施，当前数据/UI 与本地迁移状态以本文末尾的 2026-10-05 更新为准。此文档不代表 Staging/Production 数据或许可验收。

## 2026-10-04 在线元数据复核

重新读取 geoBoundaries 当前 `gbOpen` API 和其固定 GitHub 文件：

- MYS ADM1 当前元数据为 `MYS-ADM1-15666254`，16 个单元，边界年份 2017，来源为 OpenStreetMap / Wambacher，许可证为 ODbL 1.0，构建日期 2023-12-12。网站现用的马来西亚底图仍是另一份 `gbHumanitarian` / UNHCR-HDX ADM1 示意资产，边界年份 2019、CC BY 3.0 IGO；不要把新的 gbOpen 元数据误写成现有静态地图来源。
- SGP ADM0 当前元数据为 `SGP-ADM0-21272760`，1 个国家级轮廓，边界年份 2016，来源标为 Urban Redevelopment Authority、由 ADM3 衍生，许可证为 ODbL 1.0，构建日期 2023-12-12。此轮廓表达的是简化行政外边界，不是 Google Maps 街道/海岸细节图层；现有地图仅作地区选择示意。
- MYS ADM2 当前元数据仍报 160 个 District 单元，边界年份 2020，来源为 geoBoundaries / citypopulation.de，许可证字段为 Creative Commons Attribution 3.0 License，构建日期 2023-12-12，固定文件提交为 `9469f09`。重新读取 API 指向的完整 GeoJSON 后仍只有 159 个 feature；属性仅有 `shapeName`、`shapeISO`、`shapeID`、`shapeGroup`、`shapeType`，没有父州 ID。因此先前所记录的数量和父级匹配问题仍未解决。
- MyGeoportal 当前可见的 2026 Fundamental Data 清单仍将 District/Jajahan、Town 与 Pekan 列为不同行政覆盖类别，并注明数据开放政策须依数据提供机构同意；官方数据申请/可查询服务不能替代再发布授权。

因此，当前仍没有已核实为完整 City 名录的边界文件；ADM2 District 不能直接改名充当 City。该日期的结论仅指当时尚未选定 District 源；其后用户选择 geoBoundaries 的 159 个 District feature 并授权本地接入，见下方后续决定。MyGeoportal/PLANMalaysia 官方空间数据仍不能在未取得相应授权前复制到产品；City 轮廓/数量仍不伪造。

## 2026-10-04 ADM2 160/159 名称对照

将固定提交 `9469f09` 的 ADM2 GeoJSON（159 个 feature）与其来源 City Population 的当前 Malaysia 行政区目录（160 个 ADM2 项）逐名比较：目录中的 `Putrajaya` 没有对应几何 feature，因此当前文件缺失的是布城联邦直辖区；其余一项是目录名称 `Tangkak` 与几何名称 `Ledang` 不同，属于名称版本差异，不是额外缺失的边界。geoBoundaries 元数据仍声明 160 个单元，并指向该固定文件及 City Population 来源。

这意味着 159 个 ADM2 几何中没有可单独呈现的 Putrajaya District。Putrajaya 是独立联邦直辖区；用户后续选择将其地图外形并入 Kuala Lumpur 的合成显示，不把缺失的 Putrajaya ADM2 几何伪造为 District，也不并入 Sepang。此处是来源文件本身的缺项，后续本地目录整合不能消除它。

## 2026-10-04 MyGeoportal 官方服务复核补记

只读检查 MyGeoportal 的 `MyGeomap/Msia_Coverage` ArcGIS 服务，没有下载或保存几何：

- 半岛行政 District/Jajahan 图层（ID 2）返回 94 条记录，属性来源均为 JUPEM，更新时间均为 2019 年 8 月；Sabah/Sarawak 图层（ID 8）返回 70 条记录，来源分别为 JTSS 42 条、JTU 28 条，记录年份分别为 2018 与 2023。两层共 164 条记录，但层级、年代和产品所需 District/City 目录尚未核对，不能据此认定覆盖完整。
- 两个图层虽都公开 ArcGIS 查询接口，读取的记录未提供可判读的 `PPM` / `Polisi_Perkongsian_MyGDI` 值（返回为空）。MyGeoportal 2026 Fundamental Data 清单仍说明 District/Jajahan 数据开放政策依数据提供机构同意；公开服务可查不等于允许下载、复制、缓存或再发布。
- DOSM 2020 地图说明使用“156 个行政 District，另含 Perlis 与三个联邦直辖区”的表述；这与上述 164 条服务记录不能直接按数量比较，可能采用不同覆盖定义或年份。必须先取得数据持有方对当前有效数据、覆盖范围、代码关系和再发布权的书面确认。

结论：该官方 MyGeoportal 服务增加了一个可核查的替代来源及父级/代码字段，但没有解除其自身的授权与完整性问题。它不是当前本地 District 地图使用的来源；不导入或嵌入这组官方几何。

本次证据：

- [MyGeoportal 半岛 District/Jajahan 图层（ID 2）](https://mygos.mygeoportal.gov.my/gisserver/rest/services/MyGeomap/Msia_Coverage/MapServer/2)：图层字段、数据来源和更新时间；只读计数查询为 94。
- [MyGeoportal Sabah/Sarawak District/Jajahan 图层（ID 8）](https://mygos.mygeoportal.gov.my/gisserver/rest/services/MyGeomap/Msia_Coverage/MapServer/8)：图层字段、数据来源和更新时间；只读计数查询为 70。
- [MyGeoportal 2026 Fundamental Data 清单](https://www.mygeoportal.gov.my/sites/default/files/Dokumen_MyGeoportal/Senarai_Data_Fundamental_2026.pdf)：行政边界的开放须按数据提供机构政策处理。
- [DOSM Malaysia 2020 人口普查材料与边界说明](https://www.dosm.gov.my/uploads/release-content/file_20250707122258.pdf)：地图描述使用 156 个行政 District，另含 Perlis 与三个联邦直辖区。
- [MyGeoportal FAQ](https://www.mygeoportal.gov.my/en/faq)：空间格式资料须经官方申请；不属政府机关、公立大学学生或数据提供方等申请类别者，应向相关数据提供机构查询。FAQ 列出的地籍/行政代码与名称 Excel/PDF 下载，不等于空间几何的再发布许可。

为减少后续授权申请准备工作，已建立未发送的英／马来文许可咨询草稿：[`docs/operations/MALAYSIA_BOUNDARY_DATA_PERMISSION_DRAFT.md`](operations/MALAYSIA_BOUNDARY_DATA_PERMISSION_DRAFT.md)。它请求确认申请资格、实际数据持有方、完整性、公开地图使用、缓存/简化、潜在广告及署名条件；仍需用户填写申请主体，并明确指示后才会发送。

产品决定（2026-10-04）：用户确认保留 City 名称并等待获准且完整的 City 数据；不把 District/Daerah 作为替代层级，不更改现有地图或地区目录来掩盖数据差异。

后续产品决定（2026-10-04）：用户要求地区浏览页改为州属列表、所选地区地图区域、District 信息与帖子卡片；界面采用 District 一词。随后用户明确撤回同一轮对首页地图的调整，要求恢复原有首页并暂缓首页工作。后续用户又明确要求采用 159 条 geoBoundaries District 线、将 Putrajaya 与 Kuala Lumpur 合并显示，并在本地实现 District 地图；这一选择取代此前“未批准 District 几何”的历史结论，但没有授权使用 MyGeoportal/PLANMalaysia 的其他服务，也不表示托管环境已验收。

本次核对来源：

- [geoBoundaries API 说明及许可定义](https://www.geoboundaries.org/api.html)
- [MYS ADM1 gbOpen 元数据](https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM1/)
- [MYS ADM2 gbOpen 元数据](https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM2/)
- [SGP ADM0 gbOpen 元数据](https://www.geoboundaries.org/api/current/gbOpen/SGP/ADM0/)
- [固定 MYS ADM2 GeoJSON 文件（9469f09）](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/MYS/ADM2/geoBoundaries-MYS-ADM2.geojson)
- [MyGeoportal 2026 Fundamental Data 清单](https://www.mygeoportal.gov.my/sites/default/files/Dokumen_MyGeoportal/Senarai_Data_Fundamental_2026.pdf)

## 结论

当前网站已有用户选择的 geoBoundaries MYS ADM2 简化边界：15 个 GeoJSON 文件合计 159 个 feature，按 15 个 State/Federal Territory 地图文件组织；地区浏览显示 District 线，首页仍保持 State 级轮廓。固定源文件不含独立 Putrajaya ADM2 feature；现按用户决定把既有 Putrajaya 州级外形与 Kuala Lumpur 合并显示，数据目录保留原 Putrajaya 根区域及帖子 ID 以追溯。Ledang feature 的显示名映射为 Tangkak，并保留 `sourceName=Ledang`。这些具体边界、唯一名称、坐标范围、Tangkak 映射、KL/Putrajaya 选择及 Pin 点位由 `npm run test:maps` 的 4 项本地测试覆盖；District 目录/合并迁移 `20261005100000` 已应用到本地 Supabase。当前实现仍是 District 而非完整 City 名录；源数据元数据的 160/文件的 159 差异仍需透明说明。

## 候选：geoBoundaries MYS ADM2 / gbOpen

当前 API 元数据记录：

- 行政层级：ADM2，规范类型为 Districts；不能直接宣称它是全部城市 (City) 名录。
- 边界年份：2020；上游来源更新日期为 2023-05-03；当前构建日期为 2023-12-12。
- 来源：geoBoundaries、citypopulation.de。
- API 报告行政单元：160。
- API 指向的简化 GeoJSON：`https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/MYS/ADM2/geoBoundaries-MYS-ADM2_simplified.geojson`
- 许可证字段：Creative Commons Attribution 3.0 License；该数据集需依其上游署名条件处理。
- 本次直接读取该 API 的完整与简化 GeoJSON，二者均为 `features.length=159`、159 个唯一名称，且两者 ID 集合一致；API 元数据仍报告 160。抽样属性包括 `shapeName`、`shapeID`、`shapeGroup=MYS`、`shapeType=ADM2`，未见父州/ADM1 关系字段。差异不是简化过程单独造成的，仍需向数据集维护者核实实际应有单元数及缺项。

来源：

- [geoBoundaries 当前 MYS ADM2 API 元数据](https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM2/)
- [geoBoundaries 项目与下载/API 说明](https://github.com/wmgeolab/geoBoundaries)
- [citypopulation.de Malaysia 行政区列表与其所列来源](https://www.citypopulation.de/en/malaysia/admin/)
- [geoBoundaries 记录的许可来源链接](https://www.citypopulation.de/en/help/termsofuse/)

## 官方马来西亚空间数据

MyGeoportal MapServer 列出半岛 Malaysia 的 State、District/Jajahan、Mukim 图层，以及 Sabah/Sarawak District 和 Division 图层。MyGeoportal FAQ 说明公众可取得边界代码和名称清单；空间格式数据须向 PGN 正式申请，并受相关数据提供机构批准。因此该 REST 服务的可见/可查询状态本身不构成 MMWR 可复制、缓存或公开再发布其空间数据的许可。若以后申请到授权，应保存书面授权范围、署名、更新和再发布条件。

另发现 PLANMalaysia 托管的 `Data_Sempadan_Daerah` FeatureServer 图层，服务路径位于 `gisdev.planmalaysia.gov.my`。图层元数据公开了 `negeri` / `kod_negeri` 与 `daerah` / `kod_daerah` 字段，以及 GeoJSON 查询能力；本次只读查询返回 129 个要素，属性分布涵盖 13 州与 3 个联邦直辖区，其中 Sabah 24、Sarawak 12。该结果显示它具有可评估的父级代码，但目前还不能证明其记录数与产品所需的 District/City 目录完整对应；也不能与 geoBoundaries 的 159 个 ADM2 要素直接按数量比较，因为两套行政单元定义可能不同。图层未公开可见的版权声明或再发布许可。MyGeoportal 2026 Fundamental Data 清单将 District/Jajahan coverage 列为基础数据，并说明数据开放政策遵循数据提供机构同意的规则。因此在获得明确授权前，不下载或加入网站资产，也不将该服务用作 Production 数据源。

本次复核使用的只读服务证据：

- [PLANMalaysia District 图层元数据](https://gisdev.planmalaysia.gov.my/server/rest/services/Hosted/Data_Sempadan_Daerah/FeatureServer/0)：属性字段、几何类型和查询格式。
- [PLANMalaysia District 图层只读统计查询](https://gisdev.planmalaysia.gov.my/server/rest/services/Hosted/Data_Sempadan_Daerah/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json)：本次返回 129 条；此 URL 仅作复核引用，不代表再发布许可。
- [MyGeoportal 2026 Fundamental Data 清单](https://www.mygeoportal.gov.my/sites/default/files/Dokumen_MyGeoportal/Senarai_Data_Fundamental_2026.pdf)：District/Jajahan 行政覆盖数据的开放政策依数据提供机构批准。

来源：

- [MyGeoportal Msia Coverage MapServer](https://mygos.mygeoportal.gov.my/gisserver/rest/services/MyGeomap/Msia_Coverage/MapServer)
- [MyGeoportal FAQ：数据申请和空间格式分享](https://www.mygeoportal.gov.my/en/faq)
- [MyGeoportal UPI：行政区名称与代码](https://www.mygeoportal.gov.my/en/unique-parcel-identifier-upi)

## 首次实施前的核对清单（保留历史背景）

1. 对 geoBoundaries 候选查明 160 单元元数据与 159 个几何要素差异；不能静默漏掉一个行政区。对 PLANMalaysia 候选则先确认 129 条记录的覆盖范围、官方完整性及适用的行政层级。
2. 取得逐要素名称并人工检查完整行政区列表，明确数据指向 District/Division/Jajahan 中哪些单位，以及联邦直辖区如何编码；对 PLANMalaysia 图层的 `kod_negeri` / `kod_daerah` 需核对正式编码规范。
3. 将每个边界以可靠空间关系匹配到现有 ADM1 州/直辖区几何；验证邻接、越界、重叠和未匹配项。不能只按字符串或中心点臆测父州。
4. 与投稿/地区目录核对 ID 和名称，拆分 canonical ID、显示名和多语言标签；避免同名跨州串帖。
5. 核对数据许可的再发布、裁剪/简化、缓存、署名和衍生作品义务；如选用官方数据，先取得数据提供机构的正式空间资料授权。开发服务可查询不构成授权。
6. 固定上游版本/提交 SHA、下载源、边界年份、文件校验值与本地生成过程；在网站地图署名区域呈现来源/许可。此要求已在当前资产与 Credits 区域落实，但仍须持续核对上游来源许可。
7. 生成轻量地图资产并与地区目录映射；当前本地文件/目录及迁移已存在，Staging 的完整地点样本和帖子关联验证仍未完成。

## 当前产品影响

- 现有 2019 ADM1 示意州界保持不变；无 City/ADM2 线、Pin 或地区统计会伪装成真实数据。
- 地区目录、投稿位置和地图 geometry 仍未通过真实地区种子数据统一起来。
- State → District/City 地图下钻仍是 Phase 4 未完成项。
- PLANMalaysia 图层作为新的官方候选已记录，但覆盖完整性、City/District 目录对应关系及再发布授权未确认；不得直接接入。


## 2026-10-04 用户批准的 159 条 District 接入范围

用户决定直接使用固定文件中的 159 条边界，并将缺失独立 District 几何的 Putrajaya 合并显示在 Kuala Lumpur 下；现有 ADM1 州界文件中的布城轮廓保留为 KL 组合轮廓的一部分。固定文件按 15 个地图目录文件提供，合计 159 个要素；地图使用 geoBoundaries 2020 MYS ADM2 简化版，来源 City Population，许可证 CC BY 3.0。UI 已加入固定数据文件、来源目录和许可证链接。此选择明确接受“geoBoundaries 元数据 160、可用文件 159”的边界覆盖限制；不生成 Putrajaya District 几何。Ledang 几何按当前来源目录名称显示为 Tangkak。

实现中仍保留私有 Putrajaya 根地区和原帖子地区 ID 以供追溯；地区列表/地图不再把 Putrajaya 作为独立区域，公开 KL 计数与帖子查询纳入旧 Putrajaya 根及其子树。迁移 `20261005100000_mys_district_map_and_putrajaya_merge.sql` 已应用于本地 Supabase；`npm run test:maps` 4/4 通过，完整 pgTAP 的 District catalog 用例也通过。此前关于“暂不接入 District”的研究结论由本决策取代；官方 MyGeoportal 几何仍不使用。没有将本地迁移应用到托管环境。

## 2026-10-05 官方复用政策与当前来源区分

本次只读查看官方网页、API 元数据及政策文件，没有下载边界几何、提交申请或联系数据提供方：

- geoBoundaries 网站对通用数据集描述 CC BY 4.0，并要求产品醒目署名；但其 API 文档明确 `boundaryLicense` 表示原始来源发布该数据时采用的许可。当前 MYS ADM2 API 的该字段具体为 `Creative Commons Attribution 3.0 License`，`licenseSource` 指向 City Population 使用条款。因此当前本地地图按具体元数据标记 CC BY 3.0 并提供来源链接；不能仅凭 geoBoundaries 首页的通用许可说明把此来源改记为 CC BY 4.0。City Population 上游条款与该许可对这份具体几何的适用范围仍需进一步核实，本文不作法律结论。
- MyGeoportal FAQ 将 PGN 基础地理空间数据申请对象列为 G2G、国内公立大学学生 G2E 和 APD，其他类别应联系相关 APD；FAQ 另称 FGD 仅能由 MyGDI 注册用户经 Data Services 存取，当前只在政府机关间共享。2026 FGD 清单将 District/Jajahan 行政覆盖列为 DA0080，并说明数据释放政策遵循数据提供机构决定。
- MyGDI 指南第 6.7 节规定，未有协议条款时不得任意把取得的地理空间数据转交第三方；第 6.8 节要求增值产品涉及商业合同时先与 custodian 签正式协议。此处只记录政策，不判断未来 MMWR 广告模式是否适用；当前产品地图数据源是用户选定的 geoBoundaries 文件，不是 MyGeoportal 服务。

证据链接：

- [geoBoundaries 通用许可与署名说明](https://www.geoboundaries.org/)
- [geoBoundaries API 对 boundaryLicense 字段的定义](https://www.geoboundaries.org/api.html)
- [当前 MYS ADM2 API 元数据及来源许可字段](https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM2/)
- [MyGeoportal FAQ：申请类别、APD 路径及当前 FGD 存取说明](https://www.mygeoportal.gov.my/faq?field_categories2_target_id=32)
- [MyGeoportal 2026 Fundamental Data 清单（DA0080）](https://www.mygeoportal.gov.my/sites/default/files/Dokumen_MyGeoportal/Senarai_Data_Fundamental_2026.pdf)
- [MyGDI 指南第 6.7–6.8 节](https://www.mygeoportal.gov.my/sites/default/files/Dokumen_MyGeoportal/Garis%20Panduan%20MyGDI.pdf)

因此，当前已经按用户选择完成本地 District 地图资产、署名和目录映射；MyGeoportal 官方替代数据来源的申请仍不适用于当前实现，City 与 District 语义差异、160/159 源数据差异和上游许可适用范围则继续保留为已披露限制。
