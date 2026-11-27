UPDATE reporting_platform.wiki_sections
   SET body_html = replace(body_html, ' The top line sums it up, for example "2 projects · 3 things to do · next deadline 30/11/2026".', '')
 WHERE slug = 'home';
