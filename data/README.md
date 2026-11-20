# Netanya address reference

`netanya-addresses.json` contains a Netanya extract of **רשימת כתובות בישראל עם קואורדינטות**, published by **התמנון – מידע ציבורי לכל (ע״ר)** through מידע לעם. The workbook's last-modified date is November 24, 2024. The catalogue does not identify an underlying survey date or guarantee current coverage. [Dataset and publisher](https://www.odata.org.il/dataset/ac1ae1fa-6d43-4685-8434-9953e950ca9b) · [Source workbook](https://www.odata.org.il/dataset/c4263736-9d34-4d6e-909e-4e4281652728/resource/19c5be7f-e3d3-4fc6-9d65-c1d84e3256e8/download/-3.xlsx)

The catalogue identifies the data license as **Creative Commons Attribution** (`cc-by`) and links to the Open Definition license directory without specifying a license version. This extract retains that attribution. [Publisher's license metadata](https://www.odata.org.il/api/3/action/package_show?id=ac1ae1fa-6d43-4685-8434-9953e950ca9b) · [License link supplied by publisher](https://www.opendefinition.org/licenses/cc-by/)

The conversion selects Netanya, removes rows with missing street names, unusable house numbers or coordinates outside the city area, and transforms the Israeli Transverse Mercator coordinates (EPSG:2039) to WGS 84. It keeps each distinct latitude/longitude pair at five decimal places, grouped by street label and house number. Missing entries can reflect the snapshot date or filtering.

To regenerate the extract, download the linked workbook, install Python packages `openpyxl` and `pyproj`, and run `python scripts/import-netanya.py path/to/downloaded.xlsx`. The generator checks the workbook hash. The published extract was created with pyproj 3.8.0.
