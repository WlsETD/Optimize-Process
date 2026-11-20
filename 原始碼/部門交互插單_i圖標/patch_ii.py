import re,sys,io
src,dst=sys.argv[1],sys.argv[2]
h=io.open(src,encoding='utf8').read()
h=re.sub(r'<style id="ii-css">.*?</style>\n?','',h,flags=re.S)
h=re.sub(r'<script id="ii-js">.*?</script>\n?','',h,flags=re.S)
css=io.open('ii.css',encoding='utf8').read(); js=io.open('ii.js',encoding='utf8').read().replace('</script','<\\/script')
h=h.replace('</head>','<style id="ii-css">\n'+css+'</style>\n</head>',1)
h=h.replace('</body>','<script id="ii-js">\n'+js+'</script>\n</body>',1)
io.open(dst,'w',encoding='utf8').write(h)
print('ok',len(h))
