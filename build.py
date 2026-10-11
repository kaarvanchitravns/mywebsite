#!/usr/bin/env python3
"""Build the KAARVAN static site from src/index.src.html.

Usage:  python3 build.py            (writes the site into the repository root)

The source file is a single-page prototype. This script splits it into real pages
(/, /products/, /solutions/, /platform/, /about/, /contact/), each with its own title,
description, canonical URL, social tags and structured data, pre-renders the shared
sections, moves CSS and JS into cacheable files, and writes sitemap.xml, robots.txt and 404.html.

No dependencies beyond the Python 3 standard library.
"""
import hashlib, json, os, re, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src', 'index.src.html')
SITE = 'https://kaarvan.in'          # change here if the live domain differs, then rebuild
OG_IMAGE = SITE + '/assets/images/og-kaarvan.jpg'
EMAIL = 'sales@kaarvan.in'
TODAY = datetime.date.today().isoformat()

PAGES = {
    'home': dict(
        path='', crumb='Home',
        title="KAARVAN: FASTag, GPS and fleet management for Indian trucks",
        desc="KAARVAN brings FASTag, GPS and AIS-140 tracking, AI dashcams and the SYNTRA fleet platform together for India's truck owners, fleets and transporters.",
        priority='1.0'),
    'products': dict(
        path='products/', crumb='Products',
        title="Products | FASTag, GPS, AI Dashcam and SYNTRA | KAARVAN",
        desc="Explore KAARVAN FASTag for trucks, GPS and AIS-140 vehicle tracking, AI dashcams and the SYNTRA fleet management system.",
        priority='0.9'),
    'solutions': dict(
        path='solutions/', crumb='Solutions',
        title="Solutions for truck owners, fleets and transporters | KAARVAN",
        desc="How truck owners, fleet owners, transporters, drivers and logistics companies use KAARVAN for toll payments, tracking, safety and fleet visibility.",
        priority='0.8'),
    'platform': dict(
        path='platform/', crumb='Platform',
        title="SYNTRA fleet platform and mobile app | KAARVAN",
        desc="One view of every vehicle, payment and trip. See the KAARVAN SYNTRA fleet platform and mobile app (illustrative previews with sample data).",
        priority='0.8'),
    'about': dict(
        path='about/', crumb='About',
        title="About KAARVAN | Kaarvan Mobility, Alwar, Rajasthan",
        desc="KAARVAN is built by Kaarvan Mobility to bring payments, tracking, safety and fleet management for India's commercial vehicles onto one platform.",
        priority='0.7'),
    'contact': dict(
        path='contact/', crumb='Contact',
        title="Contact KAARVAN | Sales and support",
        desc="Talk to the KAARVAN team about FASTag, GPS, AI dashcams or SYNTRA. Email sales@kaarvan.in or send an inquiry.",
        priority='0.8'),
}
ORDER = ['home', 'products', 'solutions', 'platform', 'about', 'contact']
NAV_ORDER = ['about', 'products', 'solutions', 'platform', 'contact']

src = open(SRC, encoding='utf-8').read()

# ---------------------------------------------------------------- split the source
css = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
scripts = re.findall(r'<script>(.*?)</script>', src, re.S)
main_js = next(s for s in scripts if "getElementById('siteNav')" in s)
form_js = next(s for s in scripts if 'CONTACT FORM' in s)

nav_html = re.search(r'(<nav class="nav".*?</nav>)', src, re.S).group(1)
footer_html = re.search(r'(<footer>.*?</footer>)', src, re.S).group(1)
main_inner = re.search(r'<main id="app" tabindex="-1">(.*?)</main>', src, re.S).group(1)
templates = {m.group(1): m.group(2) for m in re.finditer(r'<template id="tpl-(\w+)">(.*?)</template>', src, re.S)}

views = {}
for m in re.finditer(r'<div class="page-view" id="view-(\w+)" data-route="\1">', main_inner):
    views[m.group(1)] = m.start()
starts = sorted(views.items(), key=lambda kv: kv[1])
view_html = {}
for i, (name, st) in enumerate(starts):
    en = starts[i + 1][1] if i + 1 < len(starts) else len(main_inner)
    chunk = re.sub(r'(\s*<!--(?:(?!-->).)*-->)+\s*$', '', main_inner[st:en], flags=re.S).rstrip()
    assert chunk.endswith('</div>'), name
    view_html[name] = chunk
assert set(view_html) == set(PAGES), view_html.keys()


# ---------------------------------------------------------------- helpers
def strip_html_comments(h):
    return re.sub(r'<!--.*?-->', '', h, flags=re.S)


def mount_slots(h, uid_start):
    """Pre-render <div data-xxx-slot> with the shared <template> markup."""
    uid = [uid_start]

    def repl(m):
        attrs, kind = m.group(1), m.group(2)
        uid[0] += 1
        body = templates[kind].replace('__ID__', '_' + str(uid[0]))
        rest = m.group(3)
        full = attrs + 'data-' + kind + '-slot' + rest
        if 'data-variant="light"' in full:
            if 'class="' in full:
                full = full.replace('class="', 'class="why-light ', 1)
            else:
                full += ' class="why-light"'
        return '<div' + full + '>' + body + '</div>'
    h = re.sub(r'<div([^>]*?)data-(story|op|why|tech)-slot([^>]*)></div>', repl, h)
    return h, uid[0]


def route_href(route, prefix):
    p = PAGES[route]['path']
    return (prefix + p) if p else (prefix if prefix else './')


def rewrite_links(h, prefix, current):
    def repl(m):
        r = m.group(1)
        return 'href="' + route_href(r, prefix) + ('#' + m.group(2) if m.group(2) else '') + '"'
    h = re.sub(r'href="#(home|products|solutions|platform|about|contact)(?:/(\w+))?"', repl, h)
    h = re.sub(r'(?<=[="\', (])assets/', prefix + 'assets/', h)
    # active nav state
    def act(m):
        tag = m.group(0)
        r = m.group(1)
        tag = re.sub(r'\sdata-route-link="\w+"', '', tag)
        if r == current:
            if 'class="' in tag:
                tag = tag.replace('class="', 'class="active ', 1)
            else:
                tag = tag.replace('<a ', '<a class="active" ', 1)
            tag = tag.replace('<a ', '<a aria-current="page" ', 1)
        return tag
    h = re.sub(r'<a [^>]*data-route-link="(\w+)"[^>]*>', act, h)
    return h


def ld_json(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '</script>'


ORG = {
    "@type": "Organization", "@id": SITE + "/#organization",
    "name": "Kaarvan Mobility", "alternateName": "KAARVAN", "url": SITE + "/",
    "logo": SITE + "/assets/images/kaarvan-logo-full.png",
    "description": "KAARVAN provides FASTag, GPS tracking, AIS-140 telematics, AI dashcams and the SYNTRA fleet platform for India's commercial vehicles.",
    "address": {"@type": "PostalAddress", "streetAddress": "Dhabai Complex, Gaytri Mandir Road, Near Bus Stand",
                "addressLocality": "Alwar", "addressRegion": "Rajasthan", "postalCode": "301001", "addressCountry": "IN"},
    "areaServed": "IN", "email": EMAIL,
    "contactPoint": [{"@type": "ContactPoint", "contactType": "sales and support", "email": EMAIL, "areaServed": "IN"}],
}


def structured_data(route):
    p = PAGES[route]
    url = SITE + '/' + p['path']
    graph = []
    if route == 'home':
        graph.append(ORG)
        graph.append({"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": "KAARVAN",
                      "publisher": {"@id": SITE + "/#organization"}, "inLanguage": "en-IN"})
        graph.append({"@type": "WebPage", "@id": url + "#webpage", "url": url, "name": p['title'], "description": p['desc'],
                      "isPartOf": {"@id": SITE + "/#website"}, "inLanguage": "en-IN"})
    else:
        ptype = {'about': 'AboutPage', 'contact': 'ContactPage'}.get(route, 'WebPage')
        graph.append({"@type": ptype, "@id": url + "#webpage", "url": url, "name": p['title'], "description": p['desc'],
                      "isPartOf": {"@id": SITE + "/#website"}, "about": {"@id": SITE + "/#organization"}, "inLanguage": "en-IN",
                      "breadcrumb": {"@id": url + "#breadcrumb"}})
        graph.append({"@type": "BreadcrumbList", "@id": url + "#breadcrumb", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": p['crumb'], "item": url}]})
        graph.append({"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": "KAARVAN"})
        graph.append({"@type": "Organization", "@id": SITE + "/#organization", "name": "Kaarvan Mobility", "url": SITE + "/"})
    return ld_json({"@context": "https://schema.org", "@graph": graph})


def esc(t):
    return t.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')


def head(route, prefix, css_ver, noindex=False, title=None, desc=None):
    p = PAGES.get(route, {})
    title = title or p['title']
    desc = desc or p['desc']
    url = SITE + '/' + p.get('path', '')
    h = ['<!doctype html>', '<html lang="en-IN">', '<head>', '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
         '<title>' + esc(title) + '</title>',
         '<meta name="description" content="' + esc(desc) + '">']
    if noindex:
        h.append('<meta name="robots" content="noindex,follow">')
    else:
        h.append('<meta name="robots" content="index,follow,max-image-preview:large">')
        h.append('<link rel="canonical" href="' + url + '">')
    h += ['<meta name="theme-color" content="#FFFFFF">', '<meta name="color-scheme" content="light">',
          '<link rel="icon" type="image/png" sizes="64x64" href="' + prefix + 'assets/images/favicon-eagle-64.png">',
          '<link rel="icon" type="image/png" sizes="192x192" href="' + prefix + 'assets/images/favicon-eagle-192.png">',
          '<link rel="apple-touch-icon" href="' + prefix + 'assets/images/apple-touch-icon.png">']
    if not noindex:
        h += ['<meta property="og:type" content="website">', '<meta property="og:site_name" content="KAARVAN">',
              '<meta property="og:locale" content="en_IN">', '<meta property="og:url" content="' + url + '">',
              '<meta property="og:title" content="' + esc(title) + '">', '<meta property="og:description" content="' + esc(desc) + '">',
              '<meta property="og:image" content="' + OG_IMAGE + '">', '<meta property="og:image:width" content="1200">',
              '<meta property="og:image:height" content="630">',
              '<meta property="og:image:alt" content="KAARVAN logo and a commercial truck on an Indian expressway, with the line Moving India\'s commercial vehicles.">',
              '<meta name="twitter:card" content="summary_large_image">',
              '<meta name="twitter:title" content="' + esc(title) + '">', '<meta name="twitter:description" content="' + esc(desc) + '">',
              '<meta name="twitter:image" content="' + OG_IMAGE + '">']
    if route == 'home' and not noindex:
        h.append('<link rel="preload" as="image" href="assets/images/01_hero_truck_expressway.jpg" imagesrcset="assets/images/01_hero_truck_expressway-640.jpg 640w, assets/images/01_hero_truck_expressway-1280.jpg 1280w, assets/images/01_hero_truck_expressway.jpg 1600w" imagesizes="100vw" fetchpriority="high">')
    for w in ('400', '500', '600'):
        h.append('<link rel="preload" as="font" type="font/woff2" href="' + prefix + 'assets/fonts/ibm-plex-sans-latin-' + w + '-normal.woff2" crossorigin>')
    h.append('<link rel="stylesheet" href="' + prefix + 'assets/css/site.css?v=' + css_ver + '">')
    if not noindex:
        h.append(structured_data(route))
    h.append('</head>')
    return '\n'.join(h)


# ---------------------------------------------------------------- CSS / JS assets
def min_css(c):
    c = re.sub(r'/\*.*?\*/', '', c, flags=re.S)
    c = c.replace('url(assets/', 'url(../')
    c = re.sub(r'\s+', ' ', c)
    c = re.sub(r'\s*([{};,])\s*', r'\1', c)
    return c.strip() + '\n'


def tidy_js(j):
    j = re.sub(r'/\*.*?\*/', '', j, flags=re.S)
    j = re.sub(r'\n\s*\n+', '\n', j)
    return j.strip() + '\n'


# the router called these after every view change; on real pages they run once on load
main_js = re.sub(r'  /\* called by the router.*?\n  \};\n', '''  window.kvActivateReveals(document);
  onScroll();
''', main_js, flags=re.S)
assert 'kvAfterRoute' not in main_js
legacy = '''/* old hash links (#products etc.) forward to the real pages */
(function(){
  var m = /^#\\/?(products|solutions|platform|about|contact)$/.exec(window.location.hash);
  if(m && document.documentElement.getAttribute('data-page') === 'home'){ window.location.replace(m[1] + (window.location.protocol === 'file:' ? '/index.html' : '/')); }
})();
'''
file_fix = '''/* Opened straight from disk (file://), a link ending in "/" shows the folder listing instead of the page. Point those links at index.html. On a web server nothing changes. */
(function(){
  if(window.location.protocol !== 'file:') return;
  document.querySelectorAll('a[href]').forEach(function(a){
    var h = a.getAttribute('href');
    if(/^(https?:|mailto:|tel:|#)/.test(h)) return;
    var i = h.indexOf('#'), path = i < 0 ? h : h.slice(0, i), frag = i < 0 ? '' : h.slice(i);
    if(path.slice(-1) === '/'){ a.setAttribute('href', path + 'index.html' + frag); }
  });
})();
'''
site_js = tidy_js(legacy + file_fix + main_js)
contact_js = tidy_js(form_js)
site_css = min_css(css)

os.makedirs(os.path.join(ROOT, 'assets', 'css'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'assets', 'js'), exist_ok=True)
open(os.path.join(ROOT, 'assets', 'css', 'site.css'), 'w', encoding='utf-8').write(site_css)
open(os.path.join(ROOT, 'assets', 'js', 'site.js'), 'w', encoding='utf-8').write(site_js)
open(os.path.join(ROOT, 'assets', 'js', 'contact.js'), 'w', encoding='utf-8').write(contact_js)
css_ver = hashlib.md5(site_css.encode()).hexdigest()[:8]
js_ver = hashlib.md5((site_js + contact_js).encode()).hexdigest()[:8]


# ---------------------------------------------------------------- pages
def page(route):
    prefix = '' if PAGES[route]['path'] == '' else '../'
    view = re.sub(r' data-route="\w+"', '', view_html[route], count=1)
    view, _ = mount_slots(view, 0)
    nav = rewrite_links(nav_html, prefix, route)
    foot = rewrite_links(footer_html, prefix, route)
    view = rewrite_links(view, prefix, route)
    body = ['<body>', '<a href="#app" class="skip-link">Skip to content</a>', nav, '<main id="app" tabindex="-1">', view, '</main>', foot,
            '<script src="' + prefix + 'assets/js/site.js?v=' + js_ver + '" defer></script>']
    if route == 'contact':
        body.append('<script src="' + prefix + 'assets/js/contact.js?v=' + js_ver + '" defer></script>')
    body.append('</body>')
    h = head(route, prefix, css_ver).replace('<html lang="en-IN">', '<html lang="en-IN" data-page="' + route + '">', 1)
    out = h + '\n' + '\n'.join(body) + '\n</html>\n'
    out = strip_html_comments(out)
    out = re.sub(r'\n\s*\n+', '\n', out)
    return out


def write(rel, text):
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, 'w', encoding='utf-8').write(text)


for r in ORDER:
    write(PAGES[r]['path'] + 'index.html', page(r))

# 404 page (noindex, shares the site chrome). Served from any depth, so every path is root-relative.
nf_view = '''<div class="page-view"><section class="page-head compact"><div class="container">
<span class="eyebrow on-dark">404</span><h1>This page does not exist.</h1>
<p class="lede">The link may be old or mistyped. Try one of these instead.</p>
<div class="ph-actions"><a href="/" class="btn btn-primary">Go to home</a><a href="/products/" class="btn btn-ghost-dark">Products</a><a href="/contact/" class="btn btn-ghost-dark">Contact</a></div>
</div></section></div>'''
nf = ('<body>\n<a href="#app" class="skip-link">Skip to content</a>\n' + rewrite_links(nav_html, '/', 'none') +
      '\n<main id="app" tabindex="-1">' + nf_view + '</main>\n' + rewrite_links(footer_html, '/', 'none') +
      '\n<script src="/assets/js/site.js?v=' + js_ver + '" defer></script>\n</body>\n</html>\n')
nf_head = head('home', '/', css_ver, noindex=True, title='Page not found | KAARVAN', desc='This page does not exist.').replace('<html lang="en-IN">', '<html lang="en-IN" data-page="404">', 1)
nf_head = nf_head.replace('href="assets/images/01_hero', 'href="/assets/images/01_hero')
write('404.html', strip_html_comments(nf_head + '\n' + nf))

# sitemap and robots
urls = '\n'.join(
    '  <url><loc>%s/%s</loc><lastmod>%s</lastmod><changefreq>monthly</changefreq><priority>%s</priority></url>'
    % (SITE, PAGES[r]['path'], TODAY, PAGES[r]['priority']) for r in ORDER)
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n')
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' % SITE)
write('.nojekyll', '')
write('CNAME', SITE.replace('https://', '') + '\n')   # keeps the custom domain on GitHub Pages
print('built', len(ORDER), 'pages + 404, css', len(site_css), 'bytes, js', len(site_js) + len(contact_js), 'bytes')
