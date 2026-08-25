[out:json][timeout:180];
area["ISO3166-1"="US"][admin_level=2]->.searchArea;
(
  nwr(area.searchArea)["sport"~"(^|;)table_tennis(;|$)"];
  nwr(area.searchArea)["leisure"="table_tennis_table"];
);
out center tags;
