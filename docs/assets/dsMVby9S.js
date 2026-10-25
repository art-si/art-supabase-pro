import{n as e,r as t}from"./BADuQQie.js";import{n,o as r,r as i,t as a}from"./6tzLUsKI.js";import{c as o,d as s,f as c,h as l,l as u,m as d,p as f,s as p,u as m}from"./art-file-viewer-Cg5sJoOp.js";function ee(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function h(e){if(Array.isArray(e))return e}function g(e,t){var n=e==null?null:typeof Symbol<`u`&&e[Symbol.iterator]||e[`@@iterator`];if(n!=null){var r,i,a,o,s=[],c=!0,l=!1;try{if(a=(n=n.call(e)).next,t!==0)for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,i=e}finally{try{if(!c&&n.return!=null&&(o=n.return(),Object(o)!==o))return}finally{if(l)throw i}}return s}}function te(){throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ne(e,t){return h(e)||g(e,t)||_(e,t)||te()}function _(e,t){if(e){if(typeof e==`string`)return ee(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?ee(e,t):void 0}}var re=Object.entries,v=Object.setPrototypeOf,ie=Object.isFrozen,y=Object.getPrototypeOf,ae=Object.getOwnPropertyDescriptor,b=Object.freeze,x=Object.seal,oe=Object.create,S=typeof Reflect<`u`&&Reflect,C=S.apply,w=S.construct;b||(b=function(e){return e}),x||(x=function(e){return e}),C||(C=function(e,t){var n=[...arguments].slice(2);return e.apply(t,n)}),w||(w=function(e){return new e(...[...arguments].slice(1))});var T=N(Array.prototype.forEach),se=N(Array.prototype.lastIndexOf),ce=N(Array.prototype.pop),le=N(Array.prototype.push),ue=N(Array.prototype.splice),E=Array.isArray,de=N(String.prototype.toLowerCase),fe=N(String.prototype.toString),pe=N(String.prototype.match),me=N(String.prototype.replace),he=N(String.prototype.indexOf),ge=N(String.prototype.trim),_e=N(Number.prototype.toString),D=N(Boolean.prototype.toString),ve=typeof BigInt>`u`?null:N(BigInt.prototype.toString),O=typeof Symbol>`u`?null:N(Symbol.prototype.toString),k=N(Object.prototype.hasOwnProperty),A=N(Object.prototype.toString),j=N(RegExp.prototype.test),M=ye(TypeError);function N(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);var n=[...arguments].slice(1);return C(e,t,n)}}function ye(e){return function(){return w(e,[...arguments])}}function P(e,t){let n=arguments.length>2&&arguments[2]!==void 0?arguments[2]:de;if(v&&v(e,null),!E(t))return e;let r=t.length;for(;r--;){let i=t[r];if(typeof i==`string`){let e=n(i);e!==i&&(ie(t)||(t[r]=e),i=e)}e[i]=!0}return e}function be(e){for(let t=0;t<e.length;t++)k(e,t)||(e[t]=null);return e}function F(e){let t=oe(null);for(let r of re(e)){var n=ne(r,2);let i=n[0],a=n[1];k(e,i)&&(t[i]=E(a)?be(a):a&&typeof a==`object`&&a.constructor===Object?F(a):a)}return t}function xe(e){switch(typeof e){case`string`:return e;case`number`:return _e(e);case`boolean`:return D(e);case`bigint`:return ve?ve(e):`0`;case`symbol`:return O?O(e):`Symbol()`;case`undefined`:return A(e);case`function`:case`object`:{if(e===null)return A(e);let t=e,n=I(t,`toString`);if(typeof n==`function`){let e=n(t);return typeof e==`string`?e:A(e)}return A(e)}default:return A(e)}}function I(e,t){for(;e!==null;){let n=ae(e,t);if(n){if(n.get)return N(n.get);if(typeof n.value==`function`)return N(n.value)}e=y(e)}function n(){return null}return n}function Se(e){try{return j(e,``),!0}catch{return!1}}var Ce=b(`a.abbr.acronym.address.area.article.aside.audio.b.bdi.bdo.big.blink.blockquote.body.br.button.canvas.caption.center.cite.code.col.colgroup.content.data.datalist.dd.decorator.del.details.dfn.dialog.dir.div.dl.dt.element.em.fieldset.figcaption.figure.font.footer.form.h1.h2.h3.h4.h5.h6.head.header.hgroup.hr.html.i.img.input.ins.kbd.label.legend.li.main.map.mark.marquee.menu.menuitem.meter.nav.nobr.ol.optgroup.option.output.p.picture.pre.progress.q.rp.rt.ruby.s.samp.search.section.select.shadow.slot.small.source.spacer.span.strike.strong.style.sub.summary.sup.table.tbody.td.template.textarea.tfoot.th.thead.time.tr.track.tt.u.ul.var.video.wbr`.split(`.`)),we=b(`svg.a.altglyph.altglyphdef.altglyphitem.animatecolor.animatemotion.animatetransform.circle.clippath.defs.desc.ellipse.enterkeyhint.exportparts.filter.font.g.glyph.glyphref.hkern.image.inputmode.line.lineargradient.marker.mask.metadata.mpath.part.path.pattern.polygon.polyline.radialgradient.rect.stop.style.switch.symbol.text.textpath.title.tref.tspan.view.vkern`.split(`.`)),Te=b([`feBlend`,`feColorMatrix`,`feComponentTransfer`,`feComposite`,`feConvolveMatrix`,`feDiffuseLighting`,`feDisplacementMap`,`feDistantLight`,`feDropShadow`,`feFlood`,`feFuncA`,`feFuncB`,`feFuncG`,`feFuncR`,`feGaussianBlur`,`feImage`,`feMerge`,`feMergeNode`,`feMorphology`,`feOffset`,`fePointLight`,`feSpecularLighting`,`feSpotLight`,`feTile`,`feTurbulence`]),Ee=b([`animate`,`color-profile`,`cursor`,`discard`,`font-face`,`font-face-format`,`font-face-name`,`font-face-src`,`font-face-uri`,`foreignobject`,`hatch`,`hatchpath`,`mesh`,`meshgradient`,`meshpatch`,`meshrow`,`missing-glyph`,`script`,`set`,`solidcolor`,`unknown`,`use`]),De=b(`math.menclose.merror.mfenced.mfrac.mglyph.mi.mlabeledtr.mmultiscripts.mn.mo.mover.mpadded.mphantom.mroot.mrow.ms.mspace.msqrt.mstyle.msub.msup.msubsup.mtable.mtd.mtext.mtr.munder.munderover.mprescripts`.split(`.`)),Oe=b([`maction`,`maligngroup`,`malignmark`,`mlongdiv`,`mscarries`,`mscarry`,`msgroup`,`mstack`,`msline`,`msrow`,`semantics`,`annotation`,`annotation-xml`,`mprescripts`,`none`]),ke=b([`#text`]),Ae=b(`accept.action.align.alt.autocapitalize.autocomplete.autopictureinpicture.autoplay.background.bgcolor.border.capture.cellpadding.cellspacing.checked.cite.class.clear.color.cols.colspan.command.commandfor.controls.controlslist.coords.crossorigin.datetime.decoding.default.dir.disabled.disablepictureinpicture.disableremoteplayback.download.draggable.enctype.enterkeyhint.exportparts.face.for.headers.height.hidden.high.href.hreflang.id.inert.inputmode.integrity.ismap.kind.label.lang.list.loading.loop.low.max.maxlength.media.method.min.minlength.multiple.muted.name.nonce.noshade.novalidate.nowrap.open.optimum.part.pattern.placeholder.playsinline.popover.popovertarget.popovertargetaction.poster.preload.pubdate.radiogroup.readonly.rel.required.rev.reversed.role.rows.rowspan.spellcheck.scope.selected.shape.size.sizes.slot.span.srclang.start.src.srcset.step.style.summary.tabindex.title.translate.type.usemap.valign.value.width.wrap.xmlns`.split(`.`)),je=b(`accent-height.accumulate.additive.alignment-baseline.amplitude.ascent.attributename.attributetype.azimuth.basefrequency.baseline-shift.begin.bias.by.class.clip.clippathunits.clip-path.clip-rule.color.color-interpolation.color-interpolation-filters.color-profile.color-rendering.cx.cy.d.dx.dy.diffuseconstant.direction.display.divisor.dominant-baseline.dur.edgemode.elevation.end.exponent.fill.fill-opacity.fill-rule.filter.filterunits.flood-color.flood-opacity.font-family.font-size.font-size-adjust.font-stretch.font-style.font-variant.font-weight.fx.fy.g1.g2.glyph-name.glyphref.gradientunits.gradienttransform.height.href.id.image-rendering.in.in2.intercept.k.k1.k2.k3.k4.kerning.keypoints.keysplines.keytimes.lang.lengthadjust.letter-spacing.kernelmatrix.kernelunitlength.lighting-color.local.marker-end.marker-mid.marker-start.markerheight.markerunits.markerwidth.maskcontentunits.maskunits.max.mask.mask-type.media.method.mode.min.name.numoctaves.offset.operator.opacity.order.orient.orientation.origin.overflow.paint-order.path.pathlength.patterncontentunits.patterntransform.patternunits.pointer-events.points.preservealpha.preserveaspectratio.primitiveunits.r.rx.ry.radius.refx.refy.repeatcount.repeatdur.restart.result.rotate.scale.seed.shape-rendering.slope.specularconstant.specularexponent.spreadmethod.startoffset.stddeviation.stitchtiles.stop-color.stop-opacity.stroke-dasharray.stroke-dashoffset.stroke-linecap.stroke-linejoin.stroke-miterlimit.stroke-opacity.stroke.stroke-width.style.surfacescale.systemlanguage.tabindex.tablevalues.targetx.targety.transform.transform-origin.text-anchor.text-decoration.text-orientation.text-rendering.textlength.type.u1.u2.unicode.values.vector-effect.viewbox.visibility.version.vert-adv-y.vert-origin-x.vert-origin-y.width.word-spacing.wrap.writing-mode.xchannelselector.ychannelselector.x.x1.x2.xmlns.y.y1.y2.z.zoomandpan`.split(`.`)),Me=b(`accent.accentunder.align.bevelled.close.columnalign.columnlines.columnspacing.columnspan.denomalign.depth.dir.display.displaystyle.encoding.fence.frame.height.href.id.largeop.length.linethickness.lquote.lspace.mathbackground.mathcolor.mathsize.mathvariant.maxsize.minsize.movablelimits.notation.numalign.open.rowalign.rowlines.rowspacing.rowspan.rspace.rquote.scriptlevel.scriptminsize.scriptsizemultiplier.selection.separator.separators.stretchy.subscriptshift.supscriptshift.symmetric.voffset.width.xmlns`.split(`.`)),Ne=b([`xlink:href`,`xml:id`,`xlink:title`,`xml:space`,`xmlns:xlink`]),Pe=x(/{{[\w\W]*|^[\w\W]*}}/g),Fe=x(/<%[\w\W]*|^[\w\W]*%>/g),Ie=x(/\${[\w\W]*/g),Le=x(/^data-[\-\w.\u00B7-\uFFFF]+$/),Re=x(/^aria-[\-\w]+$/),ze=x(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),Be=x(/^(?:\w+script|data):/i),Ve=x(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),He=x(/^html$/i),Ue=x(/^[a-z][.\w]*(-[.\w]+)+$/i),We=x(/<[/\w!]/g),Ge=x(/<[/\w]/g),Ke=x(/<\/no(script|embed|frames)/i),qe=x(/\/>/i),L={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,processingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Je=[`style`,`script`,`xmp`,`iframe`,`noembed`,`noframes`,`plaintext`,`noscript`],Ye=b(P({},Je)),Xe=function(){let e={};return T(Je,t=>{e[t]=x(RegExp(`</`+t+`(?=[\\t\\n\\f\\r />])`,`i`))}),b(e)}(),Ze=function(){return typeof window>`u`?null:window},Qe=function(e,t){if(typeof e!=`object`||typeof e.createPolicy!=`function`)return null;let n=null,r=`data-tt-policy-suffix`;t&&t.hasAttribute(r)&&(n=t.getAttribute(r));let i=`dompurify`+(n?`#`+n:``);try{return e.createPolicy(i,{createHTML(e){return e},createScriptURL(e){return e}})}catch{return console.warn(`TrustedTypes policy `+i+` could not be created.`),null}},$e=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}},R=function(e,t,n,r){return k(e,t)&&E(e[t])?P(r.base?F(r.base):{},e[t],r.transform):n},et=function(e,t,n){let r=k(e,t)?e[t]:void 0;return r&&typeof r==`object`?F(r):n()};function tt(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Ze(),t=e=>tt(e);if(t.version=`3.4.15`,t.removed=[],!e||!e.document||e.document.nodeType!==L.document||!e.Element)return t.isSupported=!1,t;let n=e.document,r=n,i=r.currentScript;e.DocumentFragment;let a=e.HTMLTemplateElement,o=e.Node,s=e.Element,c=e.NodeFilter;e.NamedNodeMap===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;let l=e.DOMParser,u=e.trustedTypes,d=s.prototype,f=I(d,`cloneNode`),p=I(d,`remove`),m=I(d,`removeAttributeNode`),ee=I(d,`nextSibling`),h=I(d,`childNodes`),g=I(d,`parentNode`),te=I(d,`shadowRoot`),ne=I(d,`attributes`),_=o&&o.prototype?I(o.prototype,`nodeType`):null,v=o&&o.prototype?I(o.prototype,`nodeName`):null,ie=o&&o.prototype?I(o.prototype,`ownerDocument`):null,y=function(e){return _?_(e):e.nodeType},ae=function(e){return v?v(e):e.nodeName};if(typeof a==`function`){let e=n.createElement(`template`);e.content&&e.content.ownerDocument&&(n=e.content.ownerDocument)}let S,C=``,w,_e=!1,D=0,ve=function(){if(D>0)throw M(`A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.`)},O=function(e){ve(),D++;try{return S.createHTML(e)}finally{D--}},A=function(e){ve(),D++;try{return S.createScriptURL(e)}finally{D--}},N=function(){return _e||(w=Qe(u,i),_e=!0),w},ye=n,be=ye.implementation,Je=ye.createNodeIterator,nt=ye.createDocumentFragment,rt=ye.getElementsByTagName,it=r.importNode,z=$e();t.isSupported=typeof re==`function`&&typeof g==`function`&&be&&be.createHTMLDocument!==void 0;let at=Pe,ot=Fe,st=Ie,ct=Le,lt=Re,ut=Be,dt=Ve,ft=Ue,pt=ze,B=null,mt=P({},[...Ce,...we,...Te,...De,...ke]),V=null,ht=P({},[...Ae,...je,...Me,...Ne]),H=Object.seal(oe(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),U=null,gt=null,W=Object.seal(oe(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}})),_t=!0,vt=!0,yt=!1,bt=!0,G=!1,K=!0,q=!1,xt=!1,St=null,Ct=null,wt=!1,J=!1,Tt=!1,Et=!1,Dt=!0,Ot=!1,kt=`user-content-`,At=!0,jt=!1,Mt={},Nt=null,Pt=P({},`annotation-xml.audio.colgroup.desc.foreignobject.head.iframe.math.mi.mn.mo.ms.mtext.noembed.noframes.noscript.plaintext.script.selectedcontent.style.svg.template.thead.title.video.xmp`.split(`.`)),Ft=null,It=P({},[`audio`,`video`,`img`,`source`,`image`,`track`]),Lt=null,Rt=P({},[`alt`,`class`,`for`,`id`,`label`,`name`,`pattern`,`placeholder`,`role`,`summary`,`title`,`value`,`style`,`xmlns`]),zt=`http://www.w3.org/1998/Math/MathML`,Bt=`http://www.w3.org/2000/svg`,Y=`http://www.w3.org/1999/xhtml`,Vt=Y,Ht=!1,Ut=null,Wt=P({},[zt,Bt,Y],fe),Gt=b([`mi`,`mo`,`mn`,`ms`,`mtext`]),Kt=P({},Gt),qt=b([`annotation-xml`]),Jt=P({},qt),Yt=P({},[`title`,`style`,`font`,`a`,`script`]),Xt=null,Zt=[`application/xhtml+xml`,`text/html`],X=null,Qt=null,$t=n.createElement(`form`),en=function(e){return e instanceof RegExp||e instanceof Function},tn=function(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Qt&&Qt===e)return;(!e||typeof e!=`object`)&&(e={}),e=F(e),Xt=Zt.indexOf(e.PARSER_MEDIA_TYPE)===-1?`text/html`:e.PARSER_MEDIA_TYPE,X=Xt===`application/xhtml+xml`?fe:de,B=R(e,`ALLOWED_TAGS`,mt,{transform:X}),V=R(e,`ALLOWED_ATTR`,ht,{transform:X}),Ut=R(e,`ALLOWED_NAMESPACES`,Wt,{transform:fe}),Lt=R(e,`ADD_URI_SAFE_ATTR`,Rt,{transform:X,base:Rt}),Ft=R(e,`ADD_DATA_URI_TAGS`,It,{transform:X,base:It}),Nt=R(e,`FORBID_CONTENTS`,Pt,{transform:X}),U=R(e,`FORBID_TAGS`,F({}),{transform:X}),gt=R(e,`FORBID_ATTR`,F({}),{transform:X}),Mt=k(e,`USE_PROFILES`)?e.USE_PROFILES&&typeof e.USE_PROFILES==`object`?F(e.USE_PROFILES):e.USE_PROFILES:!1,_t=e.ALLOW_ARIA_ATTR!==!1,vt=e.ALLOW_DATA_ATTR!==!1,yt=e.ALLOW_UNKNOWN_PROTOCOLS||!1,bt=e.ALLOW_SELF_CLOSE_IN_ATTR!==!1,G=e.SAFE_FOR_TEMPLATES||!1,K=e.SAFE_FOR_XML!==!1,q=e.WHOLE_DOCUMENT||!1,J=e.RETURN_DOM||!1,Tt=e.RETURN_DOM_FRAGMENT||!1,Et=e.RETURN_TRUSTED_TYPE||!1,wt=e.FORCE_BODY||!1,Dt=e.SANITIZE_DOM!==!1,Ot=e.SANITIZE_NAMED_PROPS||!1,At=e.KEEP_CONTENT!==!1,jt=e.IN_PLACE||!1,pt=Se(e.ALLOWED_URI_REGEXP)?e.ALLOWED_URI_REGEXP:ze,Vt=typeof e.NAMESPACE==`string`?e.NAMESPACE:Y,Kt=et(e,`MATHML_TEXT_INTEGRATION_POINTS`,()=>P({},Gt)),Jt=et(e,`HTML_INTEGRATION_POINTS`,()=>P({},qt));let t=et(e,`CUSTOM_ELEMENT_HANDLING`,()=>oe(null));if(H=oe(null),k(t,`tagNameCheck`)&&en(t.tagNameCheck)&&(H.tagNameCheck=t.tagNameCheck),k(t,`attributeNameCheck`)&&en(t.attributeNameCheck)&&(H.attributeNameCheck=t.attributeNameCheck),k(t,`allowCustomizedBuiltInElements`)&&typeof t.allowCustomizedBuiltInElements==`boolean`&&(H.allowCustomizedBuiltInElements=t.allowCustomizedBuiltInElements),x(H),G&&(vt=!1),Tt&&(J=!0),Mt&&(B=P({},ke),V=oe(null),Mt.html===!0&&(P(B,Ce),P(V,Ae)),Mt.svg===!0&&(P(B,we),P(V,je),P(V,Ne)),Mt.svgFilters===!0&&(P(B,Te),P(V,je),P(V,Ne)),Mt.mathMl===!0&&(P(B,De),P(V,Me),P(V,Ne))),W.tagCheck=null,W.attributeCheck=null,k(e,`ADD_TAGS`)&&(typeof e.ADD_TAGS==`function`?W.tagCheck=e.ADD_TAGS:E(e.ADD_TAGS)&&(B===mt&&(B=F(B)),P(B,e.ADD_TAGS,X))),k(e,`ADD_ATTR`)&&(typeof e.ADD_ATTR==`function`?W.attributeCheck=e.ADD_ATTR:E(e.ADD_ATTR)&&(V===ht&&(V=F(V)),P(V,e.ADD_ATTR,X))),k(e,`ADD_FORBID_CONTENTS`)&&E(e.ADD_FORBID_CONTENTS)&&(Nt===Pt&&(Nt=F(Nt)),P(Nt,e.ADD_FORBID_CONTENTS,X)),At&&(B[`#text`]=!0),q&&P(B,[`html`,`head`,`body`]),B.table&&(P(B,[`tbody`]),delete U.tbody),e.TRUSTED_TYPES_POLICY){if(typeof e.TRUSTED_TYPES_POLICY.createHTML!=`function`)throw M(`TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.`);if(typeof e.TRUSTED_TYPES_POLICY.createScriptURL!=`function`)throw M(`TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.`);let t=S;S=e.TRUSTED_TYPES_POLICY;try{C=O(``)}catch(e){throw S=t,e}}else e.TRUSTED_TYPES_POLICY===null?(S=void 0,C=``):(S===void 0&&(S=N()),S&&typeof C==`string`&&(C=O(``)));b&&b(e),Qt=e},nn=P({},[...we,...Te,...Ee]),rn=P({},[...De,...Oe]),an=function(e,t,n){return t.namespaceURI===Y?e===`svg`:t.namespaceURI===zt?e===`svg`&&(n===`annotation-xml`||Kt[n]):!!nn[e]},on=function(e,t,n){return t.namespaceURI===Y?e===`math`:t.namespaceURI===Bt?e===`math`&&Jt[n]:!!rn[e]},sn=function(e,t,n){return t.namespaceURI===Bt&&!Jt[n]||t.namespaceURI===zt&&!Kt[n]?!1:!rn[e]&&(Yt[e]||!nn[e])},cn=function(e){let t=g(e);(!t||!t.tagName)&&(t={namespaceURI:Vt,tagName:`template`});let n=de(e.tagName),r=de(t.tagName);return Ut[e.namespaceURI]?e.namespaceURI===Bt?an(n,t,r):e.namespaceURI===zt?on(n,t,r):e.namespaceURI===Y?sn(n,t,r):!!(Xt===`application/xhtml+xml`&&Ut[e.namespaceURI]):!1},Z=function(e){le(t.removed,{element:e});try{g(e).removeChild(e)}catch{if(p(e),!g(e))throw M(`a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place`)}},ln=function(e,t,n){try{m(e,t)}catch{try{e.removeAttribute(n)}catch{}}},un=function(e){fn(e);let t=h(e);if(t){let e=[];T(t,t=>{le(e,t)}),T(e,e=>{try{p(e)}catch{}})}let n=ne(e);if(n)for(let t=n.length-1;t>=0;--t){let r=n[t],i=r&&r.name;typeof i==`string`&&ln(e,r,i)}},Q=function(e,n,r){if(!r)try{r=n.getAttributeNode(e)}catch{r=null}le(t.removed,{attribute:r||null,from:n});try{r?m(n,r):n.removeAttribute(e)}catch{try{n.removeAttribute(e)}catch{}}if(e===`is`){if(J||Tt)try{Z(n)}catch{}else try{n.setAttribute(e,``)}catch{}}},dn=function(e){let t=ne(e);if(t)for(let n=t.length-1;n>=0;--n){let r=t[n],i=r&&r.name;typeof i!=`string`||V[X(i)]||ln(e,r,i)}},fn=function(e){let t=[e];for(;t.length>0;){let e=t.pop();y(e)===L.element&&dn(e);let n=h(e);if(n)for(let e=n.length-1;e>=0;--e)t.push(n[e])}},pn=function(e,t){return K?e===`patchsrc`||e===`for`&&t!==`label`&&t!==`output`:!1},mn=function(e){if(!K)return;let t=[e];for(;t.length>0;){let e=t.pop(),n=y(e);if(n===L.processingInstruction||n===L.comment&&j(Ge,e.data)){try{p(e)}catch{}continue}if(n===L.element){let t=e,n=X(ae(e));try{t.hasAttribute&&t.hasAttribute(`patchsrc`)&&t.removeAttribute(`patchsrc`),t.hasAttribute&&t.hasAttribute(`for`)&&pn(`for`,n)&&t.removeAttribute(`for`)}catch{}}let r=h(e);if(r)for(let e=r.length-1;e>=0;--e)t.push(r[e])}},hn=function(e){let t=null,r=null;if(wt)e=`<remove></remove>`+e;else{let t=pe(e,/^[\r\n\t ]+/);r=t&&t[0]}Xt===`application/xhtml+xml`&&Vt===Y&&(e=`<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>`+e+`</body></html>`);let i=S?O(e):e;if(Vt===Y)try{t=new l().parseFromString(i,Xt)}catch{}if(!t||!t.documentElement){t=be.createDocument(Vt,`template`,null);try{t.documentElement.innerHTML=Ht?C:i}catch{}}let a=t.body||t.documentElement;return e&&r&&a.insertBefore(n.createTextNode(r),a.childNodes[0]||null),Vt===Y?rt.call(t,q?`html`:`body`)[0]:q?t.documentElement:a},gn=function(e){let t=ie?ie(e):e.ownerDocument;return Je.call(t||e,e,c.SHOW_ELEMENT|c.SHOW_COMMENT|c.SHOW_TEXT|c.SHOW_PROCESSING_INSTRUCTION|c.SHOW_CDATA_SECTION,null)},_n=function(e){return e=me(e,at,` `),e=me(e,ot,` `),e=me(e,st,` `),e},vn=function(e){e.normalize();let t=ie?ie(e):e.ownerDocument,n=Je.call(t||e,e,c.SHOW_TEXT|c.SHOW_COMMENT|c.SHOW_CDATA_SECTION|c.SHOW_PROCESSING_INSTRUCTION,null),r=n.nextNode();for(;r;)r.data=_n(r.data),r=n.nextNode();let i=e.querySelectorAll?.call(e,`template`);i&&T(i,e=>{bn(e.content)&&vn(e.content)})},yn=function(e){let t=v?v(e):null;return typeof t!=`string`||X(t)!==`form`?!1:typeof e.nodeName!=`string`||typeof e.textContent!=`string`||typeof e.removeChild!=`function`||e.attributes!==ne(e)||typeof e.removeAttribute!=`function`||typeof e.removeAttributeNode!=`function`||typeof e.getAttributeNode!=`function`||typeof e.setAttribute!=`function`||typeof e.namespaceURI!=`string`||typeof e.insertBefore!=`function`||typeof e.hasChildNodes!=`function`||e.nodeType!==_(e)||e.childNodes!==h(e)},bn=function(e){if(!_||typeof e!=`object`||!e)return!1;try{return _(e)===L.documentFragment}catch{return!1}},xn=function(e){if(!_||typeof e!=`object`||!e)return!1;try{return typeof _(e)==`number`}catch{return!1}};function $(e,n,r){e.length!==0&&T(e,e=>{e.call(t,n,r,Qt)})}let Sn=function(e,t){return!!(K&&e.hasChildNodes()&&!xn(e.firstElementChild)&&j(We,e.textContent)&&j(We,e.innerHTML)||K&&e.namespaceURI===Y&&Ye[t]&&(xn(e.firstElementChild)||typeof e.textContent==`string`&&j(Xe[t],e.textContent))||e.nodeType===L.processingInstruction||K&&e.nodeType===L.comment&&j(Ge,e.data))},Cn=function(e,t){return e instanceof RegExp?j(e,t):e instanceof Function&&!!e(t,...[...arguments].slice(2))},wn=function(e,t,n){if(!U[t]&&An(t)&&Cn(H.tagNameCheck,t))return!1;if(At&&!Nt[t]){let t=g(e),r=h(e);if(r&&t){let i=r.length;for(let a=i-1;a>=0;--a){let i=e===n?f(r[a],!0):r[a];t.insertBefore(i,ee(e))}}}return Z(e),!0},Tn=function(e,t,n,r){return e.length===0?t:t===n||t===r?F(t):t},En=function(e,t){return e===t||g(e)!==null?!1:(jt&&fn(e),!0)},Dn=function(e,n){if($(z.beforeSanitizeElements,e,null),En(e,n))return!0;if(yn(e))return Z(e),!0;let r=X(ae(e));if(B=Tn(z.uponSanitizeElement,B,mt,St),$(z.uponSanitizeElement,e,{tagName:r,allowedTags:B}),En(e,n))return!0;if(Sn(e,r))return Z(e),!0;if(U[r]||!(W.tagCheck instanceof Function&&W.tagCheck(r))&&!B[r]){let t=wn(e,r,n);return t===!1&&$(z.afterSanitizeElements,e,null),t}if(y(e)===L.element&&!cn(e)||(r===`noscript`||r===`noembed`||r===`noframes`)&&j(Ke,e.innerHTML))return Z(e),!0;if(G&&e.nodeType===L.text){let n=_n(e.textContent);e.textContent!==n&&(le(t.removed,{element:e.cloneNode()}),e.textContent=n)}return $(z.afterSanitizeElements,e,null),!1},On=function(e,t,r){if(gt[t]||pn(t,e)||Dt&&(t===`id`||t===`name`)&&(r in n||r in $t))return!1;let i=V[t]||W.attributeCheck instanceof Function&&W.attributeCheck(t,e);return vt&&j(ct,t)||_t&&j(lt,t)?!0:i?Lt[t]||j(pt,me(r,dt,``))||(t===`src`||t===`xlink:href`||t===`href`)&&e!==`script`&&he(r,`data:`)===0&&Ft[e]||yt&&!j(ut,me(r,dt,``))?!0:!r:An(e)&&Cn(H.tagNameCheck,e)&&Cn(H.attributeNameCheck,t,e)||t===`is`&&H.allowCustomizedBuiltInElements&&Cn(H.tagNameCheck,r)},kn=P({},[`annotation-xml`,`color-profile`,`font-face`,`font-face-format`,`font-face-name`,`font-face-src`,`font-face-uri`,`missing-glyph`]),An=function(e){return!kn[de(e)]&&j(ft,e)},jn=function(e,t,n,r){if(S&&typeof u==`object`&&typeof u.getAttributeType==`function`&&!n)switch(u.getAttributeType(e,t)){case`TrustedHTML`:return O(r);case`TrustedScriptURL`:return A(r)}return r},Mn=function(e,t,n,r){try{return n?e.setAttributeNS(n,t,r):e.setAttribute(t,r),!yn(e)||(Z(e),!1)}catch{return Q(t,e),!1}},Nn=function(e){$(z.beforeSanitizeAttributes,e,null);let n=e.attributes;if(!n||yn(e))return;V=Tn(z.uponSanitizeAttribute,V,ht,Ct);let r={attrName:``,attrValue:``,keepAttr:!0,allowedAttributes:V,forceKeepAttr:void 0},i=n.length,a=X(e.nodeName);for(;i--;){let o=n[i],s=o.name,c=o.namespaceURI,l=o.value,u=X(s),d=l,f=s===`value`?d:ge(d),p=!1;if(r.attrName=u,r.attrValue=f,r.keepAttr=!0,r.forceKeepAttr=void 0,$(z.uponSanitizeAttribute,e,r),f=r.attrValue,Ot&&(u===`id`||u===`name`)&&he(f,kt)!==0&&(Q(s,e,o),f=kt+f,p=!0),K&&j(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,f)){Q(s,e,o);continue}if(u===`attributename`&&pe(f,`href`)){Q(s,e,o);continue}if(!r.forceKeepAttr){if(!r.keepAttr){Q(s,e,o);continue}if(!bt&&j(qe,f)){Q(s,e,o);continue}if(G&&(f=_n(f)),!On(a,u,f)){Q(s,e,o);continue}f=jn(a,u,c,f),f!==d&&Mn(e,s,c,f)&&p&&ce(t.removed)}}$(z.afterSanitizeAttributes,e,null)},Pn=function(e){let t=null,n=gn(e);for($(z.beforeSanitizeShadowDOM,e,null);t=n.nextNode();)if($(z.uponSanitizeShadowNode,t,null),Dn(t,e),Nn(t),bn(t.content)&&Pn(t.content),y(t)===L.element){let e=te(t);bn(e)&&(Fn(e),Pn(e))}$(z.afterSanitizeShadowDOM,e,null)},Fn=function(e){let t=[{node:e,shadow:null}];for(;t.length>0;){let e=t.pop();if(e.shadow){Pn(e.shadow);continue}let n=e.node,r=y(n)===L.element,i=h(n);if(i)for(let e=i.length-1;e>=0;--e)t.push({node:i[e],shadow:null});if(r){let e=v?v(n):null;if(typeof e==`string`&&X(e)===`template`){let e=n.content;bn(e)&&t.push({node:e,shadow:null})}}if(r){let e=te(n);bn(e)&&t.push({node:null,shadow:e},{node:e,shadow:null})}}};return t.sanitize=function(e){let n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},i=null,a=null,o=null,s=null;if(Ht=!e,Ht&&(e=`<!-->`),typeof e!=`string`&&!xn(e)&&(e=xe(e),typeof e!=`string`))throw M(`dirty is not a string, aborting`);if(!t.isSupported)return e;xt?(B=St,V=Ct):tn(n),(z.uponSanitizeElement.length>0||z.uponSanitizeAttribute.length>0)&&(B=F(B)),z.uponSanitizeAttribute.length>0&&(V=F(V)),t.removed=[];let c=jt&&typeof e!=`string`&&xn(e);if(c){mn(e);let t=ae(e);if(typeof t==`string`){let n=X(t);if(!B[n]||U[n])throw un(e),M(`root node is forbidden and cannot be sanitized in-place`)}if(yn(e))throw un(e),M(`root node is clobbered and cannot be sanitized in-place`);try{Fn(e)}catch(t){throw un(e),t}}else if(xn(e))i=hn(`<!---->`),a=i.ownerDocument.importNode(e,!0),a.nodeType===L.element&&a.nodeName===`BODY`||a.nodeName===`HTML`?i=a:i.appendChild(a),Fn(i);else{if(!J&&!G&&!q&&e.indexOf(`<`)===-1)return S&&Et?O(e):e;if(i=hn(e),!i)return J?null:Et?C:``}i&&wt&&Z(i.firstChild);let l=c?e:i;try{let e=gn(l);for(;o=e.nextNode();)Dn(o,l),Nn(o),bn(o.content)&&Pn(o.content)}catch(n){throw c&&(un(e),T(t.removed,e=>{e.element&&fn(e.element)})),n}if(c)return T(t.removed,e=>{e.element&&fn(e.element)}),G&&vn(e),e;if(J){if(G&&vn(i),Tt)for(s=nt.call(i.ownerDocument);i.firstChild;)s.appendChild(i.firstChild);else s=i;return(V.shadowroot||V.shadowrootmode)&&(s=it.call(r,s,!0)),s}let u=q?i.outerHTML:i.innerHTML;return q&&B[`!doctype`]&&i.ownerDocument&&i.ownerDocument.doctype&&i.ownerDocument.doctype.name&&j(He,i.ownerDocument.doctype.name)&&(u=`<!DOCTYPE `+i.ownerDocument.doctype.name+`>
`+u),G&&(u=_n(u)),S&&Et?O(u):u},t.setConfig=function(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};tn(e),xt=!0,St=B,Ct=V},t.clearConfig=function(){Qt=null,xt=!1,St=null,Ct=null,S=w,C=``},t.isValidAttribute=function(e,t,n){Qt||tn({});let r=X(e),i=X(t);return On(r,i,n)},t.addHook=function(e,t){typeof t==`function`&&k(z,e)&&le(z[e],t)},t.removeHook=function(e,t){if(k(z,e)){if(t!==void 0){let n=se(z[e],t);return n===-1?void 0:ue(z[e],n,1)[0]}return ce(z[e])}},t.removeHooks=function(e){k(z,e)&&(z[e]=[])},t.removeAllHooks=function(){z=$e()},t}var nt=tt(),rt=e=>e.replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`),it={WHOLE_DOCUMENT:!0,USE_PROFILES:{html:!0,svg:!0,svgFilters:!0,mathMl:!0},ADD_TAGS:[`use`],ADD_ATTR:[`target`,`rel`,`download`],FORBID_TAGS:[`script`,`iframe`,`object`,`embed`,`base`,`form`,`link`],FORBID_ATTR:[`srcdoc`]},z=e=>e||globalThis.document||null,at=e=>/[A-Za-z0-9_-]/.test(e),ot=(e,t)=>{let n=t+1,r=e[n]||``;if(!r)return{value:``,nextIndex:n};if(r===`\r`||r===`
`||r===`\f`)return r===`\r`&&e[n+1]===`
`&&(n+=1),{value:``,nextIndex:n+1};let i=``;for(;n<e.length&&i.length<6&&/[0-9a-f]/i.test(e[n]||``);)i+=e[n],n+=1;if(i){/\s/.test(e[n]||``)&&(n+=1);let t=Number.parseInt(i,16);return{value:t===0||t>1114111?`�`:String.fromCodePoint(t),nextIndex:n}}return{value:r,nextIndex:n+1}},st=e=>{let t=``,n=``,r=0;for(;r<e.length;){let i=e[r]||``;if(n){if(t+=i,i===`\\`){t+=e[r+1]||``,r+=2;continue}i===n&&(n=``),r+=1;continue}if(i===`/`&&e[r+1]===`*`){let t=e.indexOf(`*/`,r+2);r=t<0?e.length:t+2;continue}if(i===`"`||i===`'`){n=i,t+=i,r+=1;continue}if(i===`\\`){let n=ot(e,r);t+=n.value,r=n.nextIndex;continue}let a=i.charCodeAt(0);t+=a<32&&i!==`	`&&i!==`
`&&i!==`\r`?` `:i,r+=1}return t},ct=/^data:(?:image\/(?:avif|bmp|gif|jpeg|png|webp|x-icon)|font\/(?:collection|otf|sfnt|ttf|woff2?)|application\/(?:font-sfnt|font-woff|vnd\.ms-fontobject|x-font-opentype|x-font-ttf|x-font-woff));/i,lt=e=>{let t=/^data:image\/svg\+xml(?:;charset=[A-Za-z0-9._-]+)?,([\s\S]*)$/i.exec(e);if(!t||t[1].length>1048576)return!1;let n;try{n=decodeURIComponent(t[1])}catch{return!1}if(!/^\s*<svg(?:\s|>)/i.test(n)||/<\/?(?:script|style|foreignObject|iframe|object|embed|form|link)\b/i.test(n)||/<!\s*(?:doctype|entity)\b/i.test(n)||/\son[a-z0-9_-]+\s*=/i.test(n)||/@import\b/i.test(n)||/url\s*\(\s*(?!["']?#)/i.test(n))return!1;for(let e of n.matchAll(/\s(?:href|xlink:href|src)\s*=\s*(["'])([\s\S]*?)\1/gi)){let t=dt(e[2]||``);if(!/^#[A-Za-z0-9_.:-]+$/.test(t)&&!ct.test(t))return!1}return!0},ut=e=>{let t=``;for(let n of e){let e=n.charCodeAt(0);e<=32||e>=127&&e<=159||(t+=n)}return t.trim()},dt=ut,ft=/^data:(?:image\/(?:avif|bmp|gif|jpeg|png|webp|x-icon)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/vtt)(?:;[^,]*)?,/i,pt=e=>{let t=ut(e);return t?t.startsWith(`#`)||/^blob:/i.test(t)?!0:ft.test(t):!1},B=(e,t,n={})=>{if(!e.hasAttribute(t))return;let r=ut(e.getAttribute(t)||``);(n.fragmentOnly?/^#[A-Za-z0-9_.:-]+$/.test(r):pt(r))?e.setAttribute(t,r):e.removeAttribute(t)},mt=e=>{let t=e.trim(),n=t[0];return(n===`"`||n===`'`)&&t[t.length-1]===n&&(t=t.slice(1,-1).trim()),ut(t)},V=e=>{let t=mt(e);return t?t.startsWith(`#`)||/^blob:/i.test(t)?!0:ct.test(t)||lt(t):!1},ht=(e,t)=>{let n=``;for(let r=t;r<e.length;r+=1){let t=e[r]||``;if(n){t===`\\`?r+=1:t===n&&(n=``);continue}if(t===`"`||t===`'`)n=t;else if(t===`)`)return r}return-1},H=e=>{let t=!1,n=!1,r=``,i=0;for(;i<e.length;){let a=e[i]||``;if(r){if(a===`\\`){i+=2;continue}a===r&&(r=``),i+=1;continue}if(a===`/`&&e[i+1]===`*`){let t=e.indexOf(`*/`,i+2);i=t<0?e.length:t+2;continue}if(a===`"`||a===`'`){r=a,i+=1;continue}if(a===`\\`){i+=2;continue}if(a===`@`&&e.slice(i+1,i+7).toLowerCase()===`import`){let n=e[i+7]||``;(!n||!at(n))&&(t=!0)}if(e.slice(i,i+3).toLowerCase()===`url`&&!at(e[i-1]||``)){let t=i+3;for(;/\s/.test(e[t]||``);)t+=1;e[t]===`(`&&(n=!0)}i+=1}return{hasImport:t,hasUrl:n}},U=e=>{let t=H(st(e)),n=H(e);if(t.hasImport||t.hasUrl&&!n.hasUrl)return``;if(!n.hasUrl)return e;let r=``,i=``,a=0;for(;a<e.length;){let t=e[a]||``;if(i){if(r+=t,t===`\\`){r+=e[a+1]||``,a+=2;continue}t===i&&(i=``),a+=1;continue}if(t===`"`||t===`'`){i=t,r+=t,a+=1;continue}if(t===`/`&&e[a+1]===`*`){let t=e.indexOf(`*/`,a+2);if(t<0){r+=e.slice(a);break}r+=e.slice(a,t+2),a=t+2;continue}if(t===`\\`){r+=t,r+=e[a+1]||``,a+=2;continue}if(e.slice(a,a+3).toLowerCase()===`url`&&!at(e[a-1]||``)){let t=a+3;for(;/\s/.test(e[t]||``);)t+=1;if(e[t]===`(`){let n=ht(e,t+1);if(n<0)return``;let i=e.slice(t+1,n);r+=V(i)?e.slice(a,n+1):`none`,a=n+1;continue}}r+=t,a+=1}return r},gt=e=>{let t=e.defaultView;if(!t)return null;let n=nt(t);return n.isSupported?(n.addHook(`afterSanitizeElements`,e=>{let t=e;if(t.localName?.toLowerCase()!==`style`)return;let n=U(t.textContent||``);n?t.textContent=n:t.remove()}),n.addHook(`afterSanitizeAttributes`,e=>{let t=e,n=t.localName?.toLowerCase();if(n===`a`&&(t.getAttribute(`target`)||``).trim().toLowerCase()===`_blank`&&t.setAttribute(`rel`,`noopener noreferrer`),(n===`a`||n===`area`)&&t.removeAttribute(`ping`),t.hasAttribute(`srcset`)&&t.removeAttribute(`srcset`),[`img`,`audio`,`video`,`source`,`track`,`input`].includes(n||``)&&B(t,`src`),n===`video`&&B(t,`poster`),t.hasAttribute(`background`)&&B(t,`background`),t.namespaceURI===`http://www.w3.org/2000/svg`&&n!==`a`){let e=n===`use`||n===`mpath`;B(t,`href`,{fragmentOnly:e}),B(t,`xlink:href`,{fragmentOnly:e})}if(t.hasAttribute(`style`)){let e=U(t.getAttribute(`style`)||``);e?t.setAttribute(`style`,e):t.removeAttribute(`style`)}}),n):null},W=[`<meta charset="utf-8" />`,`<meta name="viewport" content="width=device-width,initial-scale=1" />`].join(`
  `),_t=(e,t)=>{let n=z(t),r=n?gt(n):null;return r?`<!doctype html>\n${String(r.sanitize(e,it)).replace(`<head>`,`<head>\n  ${W}`)}`:`<!doctype html>
<html lang="en"><head><meta charset="utf-8" /></head><body></body></html>`},vt=e=>{let t=e.createElement(`html`);t.lang=`en`;let n=e.createElement(`head`),r=e.createElement(`meta`);return r.setAttribute(`charset`,`utf-8`),n.append(r),t.append(n,e.createElement(`body`)),t},yt=e=>{let t=e.querySelector(`:scope > head`);if(!t)return e;if(!t.querySelector(`meta[charset]`)){let n=e.ownerDocument.createElement(`meta`);n.setAttribute(`charset`,`utf-8`),t.prepend(n)}if(!t.querySelector(`meta[name="viewport"]`)){let n=e.ownerDocument.createElement(`meta`);n.setAttribute(`name`,`viewport`),n.setAttribute(`content`,`width=device-width,initial-scale=1`),t.querySelector(`meta[charset]`)?.after(n)}return e},bt=(t,n)=>{let r=z(n);if(!r)throw Error(`A browser document is required to build printable DOM.`);let i=gt(r);if(!i)return vt(r);let a=i.sanitize(t,e(e({},it),{},{RETURN_DOM:!0}));return!a||a.nodeType!==1||a.localName.toLowerCase()!==`html`?vt(r):yt(a)},G=`
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: #f2f4f7; color: #172033; font-family: Aptos, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { padding: 24px; }
  .viewer-export-shell { position: relative; min-height: calc(100vh - 48px); overflow: visible; background: #f2f4f7; }
  .viewer-export-content { position: relative; z-index: 1; contain: none; width: 100%; min-height: 100%; overflow: visible; }
  .viewer-export-watermark { position: absolute; inset: 0; pointer-events: none; z-index: 20; background-repeat: repeat; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .viewer-export-content .file-render,
  .viewer-export-content .file-viewer,
  .viewer-export-content .viewer-stage,
  .viewer-export-content .content,
  .viewer-export-content .pdf-shell,
  .viewer-export-content .pdf-content,
  .viewer-export-content .pdf-viewport,
  .viewer-export-content .pdf-wrapper,
  .viewer-export-content .docx-fit-viewer,
  .viewer-export-content .docx-wrapper,
  .viewer-export-content .docx-canvas-wrapper,
  .viewer-export-content .msdoc-stage,
  .viewer-export-content .msdoc-paged-view,
  .viewer-export-content .code-viewer,
  .viewer-export-content .markdown-viewer,
  .viewer-export-content .email-shell,
  .viewer-export-content .archive-shell,
  .viewer-export-content .eda-shell,
  .viewer-export-content .ebook-shell,
  .viewer-export-content .umd-shell,
  .viewer-export-content .drawing-shell,
  .viewer-export-content .audio-shell,
  .viewer-export-content .cad-shell,
  .viewer-export-content .cad-body,
  .viewer-export-content .cad-canvas-wrap,
  .viewer-export-content .dwg-preview-frame {
    position: relative !important;
    inset: auto !important;
    contain: none !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .viewer-export-content .docx-wrapper {
    display: block !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .viewer-export-content .docx-canvas-wrapper {
    display: block !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .viewer-export-content .docx-print-document {
    display: block !important;
    width: fit-content !important;
    max-width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    margin: 0 auto !important;
  }
  .viewer-export-content .docx-page-frame {
    position: relative !important;
    width: var(--viewer-print-page-width, fit-content) !important;
    height: var(--viewer-print-page-height, auto) !important;
    min-height: var(--viewer-print-page-height, 0) !important;
    max-width: 100% !important;
    margin: 0 auto 18px !important;
    overflow: hidden !important;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }
  .viewer-export-content .docx-canvas-sheet {
    position: relative !important;
    contain: none !important;
    width: var(--viewer-print-page-width, 794px) !important;
    height: var(--viewer-print-page-height, 1123px) !important;
    min-height: var(--viewer-print-page-height, 1123px) !important;
    max-width: 100% !important;
    margin: 0 auto 18px !important;
    overflow: hidden !important;
    box-shadow: none !important;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }
  .viewer-export-content .docx-canvas-sheet > img {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    object-fit: fill;
  }
  .viewer-export-content .msdoc-page {
    position: relative !important;
    width: var(--viewer-print-page-width, 794px) !important;
    min-height: var(--viewer-print-page-height, 1123px) !important;
    max-width: 100% !important;
    height: auto !important;
    margin: 0 auto 18px !important;
    overflow: visible !important;
    break-after: page;
    page-break-after: always;
  }
  .viewer-export-content .docx-page-frame:last-child,
  .viewer-export-content .docx-canvas-sheet:last-child,
  .viewer-export-content .msdoc-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .viewer-export-content .docx-page-frame > section.docx {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    width: var(--viewer-print-page-width, auto) !important;
    min-height: var(--viewer-print-page-height, auto) !important;
    max-width: none !important;
    margin: 0 auto !important;
    overflow: visible !important;
    transform: none !important;
    box-shadow: none !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .viewer-export-content .msdoc-stage {
    display: block !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .viewer-export-content .msdoc-paged-view {
    display: block !important;
    gap: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .viewer-export-content .msdoc-page > .msdoc-root {
    margin: 0 auto !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .viewer-export-content .pdf-toolbar,
  .viewer-export-content .pdf-nav-pane,
  .viewer-export-content .viewer-actions,
  .viewer-export-content .code-toolbar,
  .viewer-export-content .umd-toolbar,
  .viewer-export-content .drawing-toolbar,
  .viewer-export-content .cad-toolbar {
    display: none !important;
  }
  .viewer-export-content .pdf-content,
  .viewer-export-content .pdf-shell--nav-hidden .pdf-content,
  .viewer-export-content .cad-body.without-layers {
    display: block !important;
    grid-template-columns: none !important;
  }
  .viewer-export-content .pdfViewer { padding: 0 !important; }
  .viewer-export-content .pdfViewer .page {
    margin: 0 auto 16px !important;
    border: 0 !important;
    box-shadow: none !important;
    break-after: page;
    page-break-after: always;
  }
  .viewer-export-content .pdfViewer .page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .viewer-export-content .pdf-export-document {
    display: grid;
    justify-items: center;
    gap: 18px;
    padding: 4px 0;
  }
  .viewer-export-content .pdf-export-page {
    width: var(--viewer-print-page-width, auto);
    height: var(--viewer-print-page-height, auto);
    max-width: 100%;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }
  .viewer-export-content .pdf-export-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .viewer-export-content .pdf-export-page img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .viewer-export-content .pptx-wrapper {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    transform: none !important;
  }
  .viewer-export-content .pptx-wrapper .slide {
    margin: 0 auto 18px !important;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
    box-shadow: none !important;
  }
  .viewer-export-content .pptx-wrapper .slide:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .viewer-export-content .ofd-stage {
    padding: 0 !important;
    overflow: visible !important;
  }
  .viewer-export-content .ofd-page,
  .viewer-export-content .drawing-svg,
  .viewer-export-content .cad-canvas-wrap,
  .viewer-export-content .dwg-preview-frame {
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
    box-shadow: none !important;
  }
  .viewer-export-content .ofd-page:last-child,
  .viewer-export-content .drawing-svg:last-child,
  .viewer-export-content .cad-canvas-wrap:last-child,
  .viewer-export-content .dwg-preview-frame:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .viewer-export-content .code-area {
    overflow: visible !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
  }
  .viewer-export-content .umd-body,
  .viewer-export-content .umd-stage-wrap,
  .viewer-export-content .umd-stage {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .viewer-export-content .umd-toc {
    display: none !important;
  }
  img, canvas, svg, video { max-width: 100%; }
  @media print {
    @page { margin: 12mm; }
    html, body { min-height: auto; background: #ffffff; }
    body { padding: 0; }
    .viewer-export-shell,
    .viewer-export-content {
      min-height: 0;
      overflow: visible;
      background: #ffffff;
    }
    .viewer-export-content .pdf-export-document {
      display: block;
      padding: 0;
    }
    .viewer-export-content .pdf-export-page {
      width: var(--viewer-print-page-width, auto) !important;
      height: var(--viewer-print-page-height, auto) !important;
      max-width: none !important;
      margin: 0;
      overflow: hidden;
      box-shadow: none;
    }
    .viewer-export-content .docx-page-frame {
      width: var(--viewer-print-page-width, auto) !important;
      height: var(--viewer-print-page-height, auto) !important;
      min-height: var(--viewer-print-page-height, 0) !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: hidden !important;
    }
    .viewer-export-content .docx-canvas-sheet {
      contain: none !important;
      width: var(--viewer-print-page-width, 794px) !important;
      height: var(--viewer-print-page-height, 1123px) !important;
      min-height: var(--viewer-print-page-height, 1123px) !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: hidden !important;
      box-shadow: none !important;
    }
    .viewer-export-content .msdoc-page {
      width: var(--viewer-print-page-width, 794px) !important;
      min-height: var(--viewer-print-page-height, 1123px) !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: visible !important;
    }
    .viewer-export-content .docx-page-frame > section.docx,
    .viewer-export-content .msdoc-page > .msdoc-root {
      width: var(--viewer-print-page-width, 100%) !important;
      max-width: none !important;
      border: 0 !important;
    }
    .viewer-export-content .pptx-wrapper .slide,
    .viewer-export-content .ofd-page,
    .viewer-export-content .drawing-svg,
    .viewer-export-content .cad-canvas-wrap,
    .viewer-export-content .dwg-preview-frame {
      box-shadow: none !important;
    }
  }
`,K=e=>{let t=z(e);return t?Array.from(t.querySelectorAll(`style, link[rel="stylesheet"]`)).map(e=>{if(e.localName.toLowerCase()===`style`)return`<style>${e.textContent||``}</style>`;let t=e;try{let e=Array.from(t.sheet?.cssRules||[]).map(e=>e.cssText).join(`
`);return e?`<style data-viewer-inlined-stylesheet>${e}</style>`:``}catch{return``}}).filter(Boolean).join(`
`):``},q=({contentHtml:t,includeDocumentStyles:o=!0,printStyle:s=``,title:c,watermarkInlineStyle:l=``,mask:u=null,documentRef:d})=>{let f=l?`<div class="viewer-export-watermark" style="${rt(l)}"></div>`:``,p=n(u),m=p?e(e({},p),{},{regions:p.regions?.filter(e=>e.pageIndex===void 0),stamps:p.stamps?.filter(e=>e.pageIndex===void 0)}):null,ee=r(m),h=a(t,p),g=o?K(d):``,te=s?`<style data-viewer-print-style>${s}</style>`:``,ne=p?`<style data-viewer-print-mask-style>${i}</style>`:``;return`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${rt(c)}</title>
  ${g}
  <style>${G}</style>
  ${ne}
</head>
<body>
  <main class="viewer-export-shell">
    <div class="viewer-export-content">${h}</div>
    ${ee}
    ${f}
  </main>
  ${te}
</body>
</html>`},xt=e=>_t(q(e),e.documentRef),St=e=>bt(q(e),e.documentRef),Ct=function(){var e=t(function*({source:e,mode:t=`export`,title:r,adapter:i=null,watermarkInlineStyle:a=``,mask:c=null}){let l={mode:t,title:r},d=i?.toHtml,p=n(c);if(d){yield u(e,i);let t=yield s(yield d(l)),n=yield o(i,l);return{contentHtml:t,includeDocumentStyles:i.includeDocumentStyles!==!1,printStyle:n,title:r,watermarkInlineStyle:a,mask:p,documentRef:e.ownerDocument}}yield u(e,i);let m=e.cloneNode(!0);m.querySelectorAll(`.viewer-watermark`).forEach(e=>e.remove()),f(e,m);let ee=yield o(i,l);return{contentHtml:yield s(m.innerHTML),printStyle:ee,title:r,watermarkInlineStyle:a,mask:p,documentRef:e.ownerDocument}});return function(t){return e.apply(this,arguments)}}(),wt=function(){var e=t(function*(e){return xt(yield Ct(e))});return function(t){return e.apply(this,arguments)}}(),J=function(){var e=t(function*(e){return St(yield Ct(e))});return function(t){return e.apply(this,arguments)}}();export{St as buildExportDomDocument,xt as buildExportHtmlDocument,J as buildFileViewerRenderedDomDocument,wt as buildFileViewerRenderedHtmlDocument,K as collectDocumentStyles,s as inlineFileViewerBlobUrlsInHtml,u as prepareFileViewerRenderedContentForSnapshot,f as replaceFileViewerCanvasWithImages,o as resolveFileViewerPrintStyle,bt as sanitizeFileViewerExportDocumentDom,_t as sanitizeFileViewerExportDocumentHtml,d as triggerFileViewerBlobDownload,c as triggerFileViewerUrlDownload,p as waitForFileViewerImages,m as waitForFileViewerNextPaint,l as waitForFileViewerPrintWindowReady};