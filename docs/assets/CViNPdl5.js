import{o as e}from"./C0FnF6B9.js";import{_ as t,g as n,m as r,n as i,t as a}from"./CGddwX_3.js";import{$ as o,J as s,Q as c,X as l,Y as u,Z as d,ct as f,q as p}from"./Ot18ElwH.js";import{C as m,D as h,M as g,S as _,T as v,_ as y,b,c as x,h as S,i as C,j as w,k as T,o as E,t as D,v as O,x as k,y as A}from"./X6_IVBFo.js";import{t as ee}from"./DleuxYzG.js";import{g as te}from"./Dp-FdPyR.js";import{n as j}from"./DsF7k-Jl.js";import{t as M}from"./DeWhxsYN.js";import{H as N,K as ne,U as re,a as ie,c as ae,s as oe,v as se,w as ce,x as P,y as le}from"./BkVOKZoo.js";import{t as ue}from"./DXepSjVV.js";function de(e,t){let n;if(t===void 0)for(let t of e)t!=null&&(n<t||n===void 0&&t>=t)&&(n=t);else{let r=-1;for(let i of e)(i=t(i,++r,e))!=null&&(n<i||n===void 0&&i>=i)&&(n=i)}return n}function fe(e,t){let n;if(t===void 0)for(let t of e)t!=null&&(n>t||n===void 0&&t>=t)&&(n=t);else{let r=-1;for(let i of e)(i=t(i,++r,e))!=null&&(n>i||n===void 0&&i>=i)&&(n=i)}return n}var pe=Math.PI/180,me=180/Math.PI,F=18,he=.96422,ge=1,_e=.82521,ve=4/29,I=6/29,ye=3*I*I,be=I*I*I;function xe(e){if(e instanceof L)return new L(e.l,e.a,e.b,e.opacity);if(e instanceof R)return ke(e);e instanceof l||(e=d(e));var t=Ee(e.r),n=Ee(e.g),r=Ee(e.b),i=Ce((.2225045*t+.7168786*n+.0606169*r)/ge),a,o;return t===n&&n===r?a=o=i:(a=Ce((.4360747*t+.3850649*n+.1430804*r)/he),o=Ce((.0139322*t+.0971045*n+.7141733*r)/_e)),new L(116*i-16,500*(a-i),200*(i-o),e.opacity)}function Se(e,t,n,r){return arguments.length===1?xe(e):new L(e,t,n,r??1)}function L(e,t,n,r){this.l=+e,this.a=+t,this.b=+n,this.opacity=+r}c(L,Se,o(u,{brighter(e){return new L(this.l+F*(e??1),this.a,this.b,this.opacity)},darker(e){return new L(this.l-F*(e??1),this.a,this.b,this.opacity)},rgb(){var e=(this.l+16)/116,t=isNaN(this.a)?e:e+this.a/500,n=isNaN(this.b)?e:e-this.b/200;return t=he*we(t),e=ge*we(e),n=_e*we(n),new l(Te(3.1338561*t-1.6168667*e-.4906146*n),Te(-.9787684*t+1.9161415*e+.033454*n),Te(.0719453*t-.2289914*e+1.4052427*n),this.opacity)}}));function Ce(e){return e>be?e**(1/3):e/ye+ve}function we(e){return e>I?e*e*e:ye*(e-ve)}function Te(e){return 255*(e<=.0031308?12.92*e:1.055*e**(1/2.4)-.055)}function Ee(e){return(e/=255)<=.04045?e/12.92:((e+.055)/1.055)**2.4}function De(e){if(e instanceof R)return new R(e.h,e.c,e.l,e.opacity);if(e instanceof L||(e=xe(e)),e.a===0&&e.b===0)return new R(NaN,0<e.l&&e.l<100?0:NaN,e.l,e.opacity);var t=Math.atan2(e.b,e.a)*me;return new R(t<0?t+360:t,Math.sqrt(e.a*e.a+e.b*e.b),e.l,e.opacity)}function Oe(e,t,n,r){return arguments.length===1?De(e):new R(e,t,n,r??1)}function R(e,t,n,r){this.h=+e,this.c=+t,this.l=+n,this.opacity=+r}function ke(e){if(isNaN(e.h))return new L(e.l,0,0,e.opacity);var t=e.h*pe;return new L(e.l,Math.cos(t)*e.c,Math.sin(t)*e.c,e.opacity)}c(R,Oe,o(u,{brighter(e){return new R(this.h,this.c,this.l+F*(e??1),this.opacity)},darker(e){return new R(this.h,this.c,this.l-F*(e??1),this.opacity)},rgb(){return ke(this).rgb()}}));function Ae(e){return function(t,n){var r=e((t=Oe(t)).h,(n=Oe(n)).h),i=s(t.c,n.c),a=s(t.l,n.l),o=s(t.opacity,n.opacity);return function(e){return t.h=r(e),t.c=i(e),t.l=a(e),t.opacity=o(e),t+``}}}var je=Ae(p),Me=ue(),z=e(t(),1),Ne=e(i(),1),Pe=e(n(),1),Fe=e(r(),1),Ie=e(a(),1),Le=(function(){var e=j(function(e,t,n,r){for(n=n||{},r=e.length;r--;n[e[r]]=t);return n},`o`),t=[6,8,10,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,31,33,35,36,38,40],n=[1,26],r=[1,27],i=[1,28],a=[1,29],o=[1,30],s=[1,31],c=[1,32],l=[1,33],u=[1,34],d=[1,9],f=[1,10],p=[1,11],m=[1,12],h=[1,13],g=[1,14],_=[1,15],v=[1,16],y=[1,19],b=[1,20],x=[1,21],S=[1,22],C=[1,23],w=[1,25],T=[1,35],E={trace:j(function(){},`trace`),yy:{},symbols_:{error:2,start:3,gantt:4,document:5,EOF:6,line:7,SPACE:8,statement:9,NL:10,weekday:11,weekday_monday:12,weekday_tuesday:13,weekday_wednesday:14,weekday_thursday:15,weekday_friday:16,weekday_saturday:17,weekday_sunday:18,weekend:19,weekend_friday:20,weekend_saturday:21,dateFormat:22,inclusiveEndDates:23,topAxis:24,axisFormat:25,tickInterval:26,excludes:27,includes:28,todayMarker:29,title:30,acc_title:31,acc_title_value:32,acc_descr:33,acc_descr_value:34,acc_descr_multiline_value:35,section:36,clickStatement:37,taskTxt:38,taskData:39,click:40,callbackname:41,callbackargs:42,href:43,clickStatementDebug:44,$accept:0,$end:1},terminals_:{2:`error`,4:`gantt`,6:`EOF`,8:`SPACE`,10:`NL`,12:`weekday_monday`,13:`weekday_tuesday`,14:`weekday_wednesday`,15:`weekday_thursday`,16:`weekday_friday`,17:`weekday_saturday`,18:`weekday_sunday`,20:`weekend_friday`,21:`weekend_saturday`,22:`dateFormat`,23:`inclusiveEndDates`,24:`topAxis`,25:`axisFormat`,26:`tickInterval`,27:`excludes`,28:`includes`,29:`todayMarker`,30:`title`,31:`acc_title`,32:`acc_title_value`,33:`acc_descr`,34:`acc_descr_value`,35:`acc_descr_multiline_value`,36:`section`,38:`taskTxt`,39:`taskData`,40:`click`,41:`callbackname`,42:`callbackargs`,43:`href`},productions_:[0,[3,3],[5,0],[5,2],[7,2],[7,1],[7,1],[7,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[19,1],[19,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,2],[9,1],[9,1],[9,1],[9,2],[37,2],[37,3],[37,3],[37,4],[37,3],[37,4],[37,2],[44,2],[44,3],[44,3],[44,4],[44,3],[44,4],[44,2]],performAction:j(function(e,t,n,r,i,a,o){var s=a.length-1;switch(i){case 1:return a[s-1];case 2:this.$=[];break;case 3:a[s-1].push(a[s]),this.$=a[s-1];break;case 4:case 5:this.$=a[s];break;case 6:case 7:this.$=[];break;case 8:r.setWeekday(`monday`);break;case 9:r.setWeekday(`tuesday`);break;case 10:r.setWeekday(`wednesday`);break;case 11:r.setWeekday(`thursday`);break;case 12:r.setWeekday(`friday`);break;case 13:r.setWeekday(`saturday`);break;case 14:r.setWeekday(`sunday`);break;case 15:r.setWeekend(`friday`);break;case 16:r.setWeekend(`saturday`);break;case 17:r.setDateFormat(a[s].substr(11)),this.$=a[s].substr(11);break;case 18:r.enableInclusiveEndDates(),this.$=a[s].substr(18);break;case 19:r.TopAxis(),this.$=a[s].substr(8);break;case 20:r.setAxisFormat(a[s].substr(11)),this.$=a[s].substr(11);break;case 21:r.setTickInterval(a[s].substr(13)),this.$=a[s].substr(13);break;case 22:r.setExcludes(a[s].substr(9)),this.$=a[s].substr(9);break;case 23:r.setIncludes(a[s].substr(9)),this.$=a[s].substr(9);break;case 24:r.setTodayMarker(a[s].substr(12)),this.$=a[s].substr(12);break;case 27:r.setDiagramTitle(a[s].substr(6)),this.$=a[s].substr(6);break;case 28:this.$=a[s].trim(),r.setAccTitle(this.$);break;case 29:case 30:this.$=a[s].trim(),r.setAccDescription(this.$);break;case 31:r.addSection(a[s].substr(8)),this.$=a[s].substr(8);break;case 33:r.addTask(a[s-1],a[s]),this.$=`task`;break;case 34:this.$=a[s-1],r.setClickEvent(a[s-1],a[s],null);break;case 35:this.$=a[s-2],r.setClickEvent(a[s-2],a[s-1],a[s]);break;case 36:this.$=a[s-2],r.setClickEvent(a[s-2],a[s-1],null),r.setLink(a[s-2],a[s]);break;case 37:this.$=a[s-3],r.setClickEvent(a[s-3],a[s-2],a[s-1]),r.setLink(a[s-3],a[s]);break;case 38:this.$=a[s-2],r.setClickEvent(a[s-2],a[s],null),r.setLink(a[s-2],a[s-1]);break;case 39:this.$=a[s-3],r.setClickEvent(a[s-3],a[s-1],a[s]),r.setLink(a[s-3],a[s-2]);break;case 40:this.$=a[s-1],r.setLink(a[s-1],a[s]);break;case 41:case 47:this.$=a[s-1]+` `+a[s];break;case 42:case 43:case 45:this.$=a[s-2]+` `+a[s-1]+` `+a[s];break;case 44:case 46:this.$=a[s-3]+` `+a[s-2]+` `+a[s-1]+` `+a[s]}},`anonymous`),table:[{3:1,4:[1,2]},{1:[3]},e(t,[2,2],{5:3}),{6:[1,4],7:5,8:[1,6],9:7,10:[1,8],11:17,12:n,13:r,14:i,15:a,16:o,17:s,18:c,19:18,20:l,21:u,22:d,23:f,24:p,25:m,26:h,27:g,28:_,29:v,30:y,31:b,33:x,35:S,36:C,37:24,38:w,40:T},e(t,[2,7],{1:[2,1]}),e(t,[2,3]),{9:36,11:17,12:n,13:r,14:i,15:a,16:o,17:s,18:c,19:18,20:l,21:u,22:d,23:f,24:p,25:m,26:h,27:g,28:_,29:v,30:y,31:b,33:x,35:S,36:C,37:24,38:w,40:T},e(t,[2,5]),e(t,[2,6]),e(t,[2,17]),e(t,[2,18]),e(t,[2,19]),e(t,[2,20]),e(t,[2,21]),e(t,[2,22]),e(t,[2,23]),e(t,[2,24]),e(t,[2,25]),e(t,[2,26]),e(t,[2,27]),{32:[1,37]},{34:[1,38]},e(t,[2,30]),e(t,[2,31]),e(t,[2,32]),{39:[1,39]},e(t,[2,8]),e(t,[2,9]),e(t,[2,10]),e(t,[2,11]),e(t,[2,12]),e(t,[2,13]),e(t,[2,14]),e(t,[2,15]),e(t,[2,16]),{41:[1,40],43:[1,41]},e(t,[2,4]),e(t,[2,28]),e(t,[2,29]),e(t,[2,33]),e(t,[2,34],{42:[1,42],43:[1,43]}),e(t,[2,40],{41:[1,44]}),e(t,[2,35],{43:[1,45]}),e(t,[2,36]),e(t,[2,38],{42:[1,46]}),e(t,[2,37]),e(t,[2,39])],defaultActions:{},parseError:j(function(e,t){if(t.recoverable)this.trace(e);else{var n=Error(e);throw n.hash=t,n}},`parseError`),parse:j(function(e){var t=this,n=[0],r=[],i=[null],a=[],o=this.table,s=``,c=0,l=0,u=0,d=2,f=1,p=a.slice.call(arguments,1),m=Object.create(this.lexer),h={yy:{}};for(var g in this.yy)Object.prototype.hasOwnProperty.call(this.yy,g)&&(h.yy[g]=this.yy[g]);m.setInput(e,h.yy),h.yy.lexer=m,h.yy.parser=this,m.yylloc===void 0&&(m.yylloc={});var _=m.yylloc;a.push(_);var v=m.options&&m.options.ranges;this.parseError=typeof h.yy.parseError==`function`?h.yy.parseError:Object.getPrototypeOf(this).parseError;function y(e){n.length-=2*e,i.length-=e,a.length-=e}j(y,`popStack`);function b(){var e=r.pop()||m.lex()||f;return typeof e!=`number`&&(e instanceof Array&&(r=e,e=r.pop()),e=t.symbols_[e]||e),e}j(b,`lex`);for(var x,S,C,w,T,E={},D,O,k,A;;){if(C=n[n.length-1],this.defaultActions[C]?w=this.defaultActions[C]:(x??(x=b()),w=o[C]&&o[C][x]),w===void 0||!w.length||!w[0]){var ee=``;for(D in A=[],o[C])this.terminals_[D]&&D>d&&A.push(`'`+this.terminals_[D]+`'`);ee=m.showPosition?`Parse error on line `+(c+1)+`:
`+m.showPosition()+`
Expecting `+A.join(`, `)+`, got '`+(this.terminals_[x]||x)+`'`:`Parse error on line `+(c+1)+`: Unexpected `+(x==f?`end of input`:`'`+(this.terminals_[x]||x)+`'`),this.parseError(ee,{text:m.match,token:this.terminals_[x]||x,line:m.yylineno,loc:_,expected:A})}if(w[0]instanceof Array&&w.length>1)throw Error(`Parse Error: multiple actions possible at state: `+C+`, token: `+x);switch(w[0]){case 1:n.push(x),i.push(m.yytext),a.push(m.yylloc),n.push(w[1]),x=null,S?(x=S,S=null):(l=m.yyleng,s=m.yytext,c=m.yylineno,_=m.yylloc,u>0&&u--);break;case 2:if(O=this.productions_[w[1]][1],E.$=i[i.length-O],E._$={first_line:a[a.length-(O||1)].first_line,last_line:a[a.length-1].last_line,first_column:a[a.length-(O||1)].first_column,last_column:a[a.length-1].last_column},v&&(E._$.range=[a[a.length-(O||1)].range[0],a[a.length-1].range[1]]),T=this.performAction.apply(E,[s,l,c,h.yy,w[1],i,a].concat(p)),T!==void 0)return T;O&&(n=n.slice(0,-1*O*2),i=i.slice(0,-1*O),a=a.slice(0,-1*O)),n.push(this.productions_[w[1]][0]),i.push(E.$),a.push(E._$),k=o[n[n.length-2]][n[n.length-1]],n.push(k);break;case 3:return!0}}return!0},`parse`)};E.lexer=(function(){return{EOF:1,parseError:j(function(e,t){if(this.yy.parser)this.yy.parser.parseError(e,t);else throw Error(e)},`parseError`),setInput:j(function(e,t){return this.yy=t||this.yy||{},this._input=e,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match=``,this.conditionStack=[`INITIAL`],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},`setInput`),input:j(function(){var e=this._input[0];return this.yytext+=e,this.yyleng++,this.offset++,this.match+=e,this.matched+=e,e.match(/(?:\r\n?|\n).*/g)?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),e},`input`),unput:j(function(e){var t=e.length,n=e.split(/(?:\r\n?|\n)/g);this._input=e+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-t),this.offset-=t;var r=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),n.length-1&&(this.yylineno-=n.length-1);var i=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:n?(n.length===r.length?this.yylloc.first_column:0)+r[r.length-n.length].length-n[0].length:this.yylloc.first_column-t},this.options.ranges&&(this.yylloc.range=[i[0],i[0]+this.yyleng-t]),this.yyleng=this.yytext.length,this},`unput`),more:j(function(){return this._more=!0,this},`more`),reject:j(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError(`Lexical error on line `+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:``,token:null,line:this.yylineno});return this},`reject`),less:j(function(e){this.unput(this.match.slice(e))},`less`),pastInput:j(function(){var e=this.matched.substr(0,this.matched.length-this.match.length);return(e.length>20?`...`:``)+e.substr(-20).replace(/\n/g,``)},`pastInput`),upcomingInput:j(function(){var e=this.match;return e.length<20&&(e+=this._input.substr(0,20-e.length)),(e.substr(0,20)+(e.length>20?`...`:``)).replace(/\n/g,``)},`upcomingInput`),showPosition:j(function(){var e=this.pastInput(),t=Array(e.length+1).join(`-`);return e+this.upcomingInput()+`
`+t+`^`},`showPosition`),test_match:j(function(e,t){var n,r,i;if(this.options.backtrack_lexer&&(i={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(i.yylloc.range=this.yylloc.range.slice(0))),r=e[0].match(/(?:\r\n?|\n).*/g),r&&(this.yylineno+=r.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:r?r[r.length-1].length-r[r.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+e[0].length},this.yytext+=e[0],this.match+=e[0],this.matches=e,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(e[0].length),this.matched+=e[0],n=this.performAction.call(this,this.yy,this,t,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),n)return n;if(this._backtrack){for(var a in i)this[a]=i[a];return!1}return!1},`test_match`),next:j(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var e,t,n,r;this._more||(this.yytext=``,this.match=``);for(var i=this._currentRules(),a=0;a<i.length;a++)if(n=this._input.match(this.rules[i[a]]),n&&(!t||n[0].length>t[0].length)){if(t=n,r=a,this.options.backtrack_lexer){if(e=this.test_match(n,i[a]),e!==!1)return e;if(this._backtrack){t=!1;continue}return!1}if(!this.options.flex)break}return t?(e=this.test_match(t,i[r]),e!==!1&&e):this._input===``?this.EOF:this.parseError(`Lexical error on line `+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:``,token:null,line:this.yylineno})},`next`),lex:j(function(){return this.next()||this.lex()},`lex`),begin:j(function(e){this.conditionStack.push(e)},`begin`),popState:j(function(){return this.conditionStack.length-1>0?this.conditionStack.pop():this.conditionStack[0]},`popState`),_currentRules:j(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},`_currentRules`),topState:j(function(e){return e=this.conditionStack.length-1-Math.abs(e||0),e>=0?this.conditionStack[e]:`INITIAL`},`topState`),pushState:j(function(e){this.begin(e)},`pushState`),stateStackSize:j(function(){return this.conditionStack.length},`stateStackSize`),options:{"case-insensitive":!0},performAction:j(function(e,t,n,r){switch(n){case 0:return this.begin(`open_directive`),`open_directive`;case 1:return this.begin(`acc_title`),31;case 2:return this.popState(),`acc_title_value`;case 3:return this.begin(`acc_descr`),33;case 4:return this.popState(),`acc_descr_value`;case 5:this.begin(`acc_descr_multiline`);break;case 6:this.popState();break;case 7:return`acc_descr_multiline_value`;case 8:break;case 9:break;case 10:break;case 11:return 10;case 12:break;case 13:break;case 14:this.begin(`href`);break;case 15:this.popState();break;case 16:return 43;case 17:this.begin(`callbackname`);break;case 18:this.popState();break;case 19:this.popState(),this.begin(`callbackargs`);break;case 20:return 41;case 21:this.popState();break;case 22:return 42;case 23:this.begin(`click`);break;case 24:this.popState();break;case 25:return 40;case 26:return 4;case 27:return 22;case 28:return 23;case 29:return 24;case 30:return 25;case 31:return 26;case 32:return 28;case 33:return 27;case 34:return 29;case 35:return 12;case 36:return 13;case 37:return 14;case 38:return 15;case 39:return 16;case 40:return 17;case 41:return 18;case 42:return 20;case 43:return 21;case 44:return`date`;case 45:return 30;case 46:return`accDescription`;case 47:return 36;case 48:return 38;case 49:return 39;case 50:return`:`;case 51:return 6;case 52:return`INVALID`}},`anonymous`),rules:[/^(?:%%\{)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:%%(?!\{)*[^\n]*)/i,/^(?:[^\}]%%*[^\n]*)/i,/^(?:%%*[^\n]*[\n]*)/i,/^(?:[\n]+)/i,/^(?:\s+)/i,/^(?:%[^\n]*)/i,/^(?:href[\s]+["])/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:call[\s]+)/i,/^(?:\([\s]*\))/i,/^(?:\()/i,/^(?:[^(]*)/i,/^(?:\))/i,/^(?:[^)]*)/i,/^(?:click[\s]+)/i,/^(?:[\s\n])/i,/^(?:[^\s\n]*)/i,/^(?:gantt\b)/i,/^(?:dateFormat\s[^#\n;]+)/i,/^(?:inclusiveEndDates\b)/i,/^(?:topAxis\b)/i,/^(?:axisFormat\s[^#\n;]+)/i,/^(?:tickInterval\s[^#\n;]+)/i,/^(?:includes\s[^#\n;]+)/i,/^(?:excludes\s[^#\n;]+)/i,/^(?:todayMarker\s[^\n;]+)/i,/^(?:weekday\s+monday\b)/i,/^(?:weekday\s+tuesday\b)/i,/^(?:weekday\s+wednesday\b)/i,/^(?:weekday\s+thursday\b)/i,/^(?:weekday\s+friday\b)/i,/^(?:weekday\s+saturday\b)/i,/^(?:weekday\s+sunday\b)/i,/^(?:weekend\s+friday\b)/i,/^(?:weekend\s+saturday\b)/i,/^(?:\d\d\d\d-\d\d-\d\d\b)/i,/^(?:title\s[^\n]+)/i,/^(?:accDescription\s[^#\n;]+)/i,/^(?:section\s[^\n]+)/i,/^(?:[^:\n]+)/i,/^(?::[^#\n;]+)/i,/^(?::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{acc_descr_multiline:{rules:[6,7],inclusive:!1},acc_descr:{rules:[4],inclusive:!1},acc_title:{rules:[2],inclusive:!1},callbackargs:{rules:[21,22],inclusive:!1},callbackname:{rules:[18,19,20],inclusive:!1},href:{rules:[15,16],inclusive:!1},click:{rules:[24,25],inclusive:!1},INITIAL:{rules:[0,1,3,5,8,9,10,11,12,13,14,17,23,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52],inclusive:!0}}}})();function D(){this.yy={}}return j(D,`Parser`),D.prototype=E,E.Parser=D,new D})();Le.parser=Le;var Re=Le;z.default.extend(Ne.default),z.default.extend(Pe.default),z.default.extend(Fe.default);var ze={friday:5,saturday:6},B=``,Be=``,Ve=void 0,He=``,V=[],H=[],Ue=new Map,We=[],U=[],W=``,G=``,Ge=[`active`,`done`,`crit`,`milestone`,`vert`],Ke=[],K=``,q=!1,qe=!1,Je=`sunday`,J=`saturday`,Ye=0,Xe=j(function(){We=[],U=[],W=``,Ke=[],At=0,Nt=void 0,X=void 0,Z=[],B=``,Be=``,G=``,Ve=void 0,He=``,V=[],H=[],q=!1,qe=!1,Ye=0,Ue=new Map,K=``,ie(),Je=`sunday`,J=`saturday`},`clear`),Ze=j(function(e){K=e},`setDiagramId`),Qe=j(function(e){Be=e},`setAxisFormat`),$e=j(function(){return Be},`getAxisFormat`),et=j(function(e){Ve=e},`setTickInterval`),tt=j(function(){return Ve},`getTickInterval`),nt=j(function(e){He=e},`setTodayMarker`),rt=j(function(){return He},`getTodayMarker`),it=j(function(e){B=e},`setDateFormat`),at=j(function(){q=!0},`enableInclusiveEndDates`),ot=j(function(){return q},`endDatesAreInclusive`),st=j(function(){qe=!0},`enableTopAxis`),ct=j(function(){return qe},`topAxisEnabled`),lt=j(function(e){G=e},`setDisplayMode`),ut=j(function(){return G},`getDisplayMode`),dt=j(function(){return B},`getDateFormat`),ft=j((e,t)=>{let n=t.toLowerCase().split(/[\s,]+/).filter(e=>e!==``);return[...new Set([...e,...n])]},`mergeTokens`),pt=j(function(e){V=ft(V,e)},`setIncludes`),mt=j(function(){return V},`getIncludes`),ht=j(function(e){H=ft(H,e)},`setExcludes`),gt=j(function(){return H},`getExcludes`),_t=j(function(){return Ue},`getLinks`),vt=j(function(e){W=e,We.push(e)},`addSection`),yt=j(function(){return We},`getSections`),bt=j(function(){let e=Lt(),t=0;for(;!e&&t<10;)e=Lt(),t++;return U=Z,U},`getTasks`),xt=j(function(e,t,n,r){let i=e.format(t.trim()),a=e.format(`YYYY-MM-DD`);return r.includes(i)||r.includes(a)?!1:n.includes(`weekends`)&&(e.isoWeekday()===ze[J]||e.isoWeekday()===ze[J]+1)||n.includes(e.format(`dddd`).toLowerCase())?!0:n.includes(i)||n.includes(a)},`isInvalidDate`),St=j(function(e){Je=e},`setWeekday`),Ct=j(function(){return Je},`getWeekday`),wt=j(function(e){J=e},`setWeekend`),Tt=j(function(e,t,n,r){if(!n.length||e.manualEndTime)return;let i;i=e.startTime instanceof Date?(0,z.default)(e.startTime):(0,z.default)(e.startTime,t,!0),i=i.add(1,`d`);let a;a=e.endTime instanceof Date?(0,z.default)(e.endTime):(0,z.default)(e.endTime,t,!0);let[o,s]=Et(i,a,t,n,r);e.endTime=o.toDate(),e.renderEndTime=s},`checkTaskDates`),Et=j(function(e,t,n,r,i){let a=!1,o=null,s=t.add(1e4,`d`);for(;e<=t;){if(a||(o=t.toDate()),a=xt(e,n,r,i),a&&(t=t.add(1,`d`),t>s))throw Error("Failed to find a valid date that was not excluded by `excludes` after 10,000 iterations.");e=e.add(1,`d`)}return[t,o]},`fixTaskDates`),Dt=j(function(e,t,n){if(n=n.trim(),j(e=>{let t=e.trim();return t===`x`||t===`X`},`isTimestampFormat`)(t)&&/^\d+$/.test(n))return new Date(Number(n));let r=/^after\s+(?<ids>[\d\w- ]+)/.exec(n);if(r!==null){let e=null;for(let t of r.groups.ids.split(` `)){let n=Q(t);n!==void 0&&(!e||n.endTime>e.endTime)&&(e=n)}if(e)return e.endTime;let t=new Date;return t.setHours(0,0,0,0),t}let i=(0,z.default)(n,t.trim(),!0);if(i.isValid())return i.toDate();{M.debug(`Invalid date:`+n),M.debug(`With date format:`+t.trim());let e=new Date(n);if(e===void 0||isNaN(e.getTime())||e.getFullYear()<-1e4||e.getFullYear()>1e4)throw Error(`Invalid date:`+n);return e}},`getStartDate`),Ot=j(function(e){let t=/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/.exec(e.trim());return t===null?[NaN,`ms`]:[Number.parseFloat(t[1]),t[2]]},`parseDuration`),kt=j(function(e,t,n,r=!1){n=n.trim();let i=/^until\s+(?<ids>[\d\w- ]+)/.exec(n);if(i!==null){let e=null;for(let t of i.groups.ids.split(` `)){let n=Q(t);n!==void 0&&(!e||n.startTime<e.startTime)&&(e=n)}if(e)return e.startTime;let t=new Date;return t.setHours(0,0,0,0),t}let a=(0,z.default)(n,t.trim(),!0);if(a.isValid())return r&&(a=a.add(1,`d`)),a.toDate();let o=(0,z.default)(e),[s,c]=Ot(n);if(!Number.isNaN(s)){let e=o.add(s,c);e.isValid()&&(o=e)}return o.toDate()},`getEndDate`),At=0,Y=j(function(e){return e===void 0?(At+=1,`task`+At):e},`parseId`),jt=j(function(e,t){let n;n=t.substr(0,1)===`:`?t.substr(1,t.length):t;let r=n.split(`,`),i={};Ut(r,i,Ge);for(let e=0;e<r.length;e++)r[e]=r[e].trim();let a=``;switch(r.length){case 1:i.id=Y(),i.startTime=e.endTime,a=r[0];break;case 2:i.id=Y(),i.startTime=Dt(void 0,B,r[0]),a=r[1];break;case 3:i.id=Y(r[0]),i.startTime=Dt(void 0,B,r[1]),a=r[2]}return a&&(i.endTime=kt(i.startTime,B,a,q),i.manualEndTime=(0,z.default)(a,`YYYY-MM-DD`,!0).isValid(),Tt(i,B,H,V)),i},`compileData`),Mt=j(function(e,t){let n;n=t.substr(0,1)===`:`?t.substr(1,t.length):t;let r=n.split(`,`),i={};Ut(r,i,Ge);for(let e=0;e<r.length;e++)r[e]=r[e].trim();switch(r.length){case 1:i.id=Y(),i.startTime={type:`prevTaskEnd`,id:e},i.endTime={data:r[0]};break;case 2:i.id=Y(),i.startTime={type:`getStartDate`,startData:r[0]},i.endTime={data:r[1]};break;case 3:i.id=Y(r[0]),i.startTime={type:`getStartDate`,startData:r[1]},i.endTime={data:r[2]}}return i},`parseData`),Nt,X,Z=[],Pt={},Ft=j(function(e,t){let n={section:W,type:W,processed:!1,manualEndTime:!1,renderEndTime:null,raw:{data:t},task:e,classes:[]},r=Mt(X,t);n.raw.startTime=r.startTime,n.raw.endTime=r.endTime,n.id=r.id,n.prevTaskId=X,n.active=r.active,n.done=r.done,n.crit=r.crit,n.milestone=r.milestone,n.vert=r.vert,n.vert?n.order=-1:(n.order=Ye,Ye++);let i=Z.push(n);X=n.id,Pt[n.id]=i-1},`addTask`),Q=j(function(e){let t=Pt[e];return Z[t]},`findTaskById`),It=j(function(e,t){let n={section:W,type:W,description:e,task:e,classes:[]},r=jt(Nt,t);n.startTime=r.startTime,n.endTime=r.endTime,n.id=r.id,n.active=r.active,n.done=r.done,n.crit=r.crit,n.milestone=r.milestone,n.vert=r.vert,Nt=n,U.push(n)},`addTaskOrg`),Lt=j(function(){let e=j(function(e){let t=Z[e],n=``;switch(Z[e].raw.startTime.type){case`prevTaskEnd`:t.startTime=Q(t.prevTaskId).endTime;break;case`getStartDate`:n=Dt(void 0,B,Z[e].raw.startTime.startData),n&&(Z[e].startTime=n)}return Z[e].startTime&&(Z[e].endTime=kt(Z[e].startTime,B,Z[e].raw.endTime.data,q),Z[e].endTime&&(Z[e].processed=!0,Z[e].manualEndTime=(0,z.default)(Z[e].raw.endTime.data,`YYYY-MM-DD`,!0).isValid(),Tt(Z[e],B,H,V))),Z[e].processed},`compileTask`),t=!0;for(let[n,r]of Z.entries())e(n),t=t&&r.processed;return t},`compileTasks`),Rt=j(function(e,t){let n=t;P().securityLevel!==`loose`&&(n=(0,Me.sanitizeUrl)(t)),e.split(`,`).forEach(function(e){Q(e)!==void 0&&(Vt(e,()=>{window.open(n,`_self`)}),Ue.set(e,n))}),zt(e,`clickable`)},`setLink`),zt=j(function(e,t){e.split(`,`).forEach(function(e){let n=Q(e);n!==void 0&&n.classes.push(t)})},`setClass`),Bt=j(function(e,t,n){if(P().securityLevel!==`loose`||t===void 0)return;let r=[];if(typeof n==`string`){r=n.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);for(let e=0;e<r.length;e++){let t=r[e].trim();t.startsWith(`"`)&&t.endsWith(`"`)&&(t=t.substr(1,t.length-2)),r[e]=t}}r.length===0&&r.push(e),Q(e)!==void 0&&Vt(e,()=>{te.runFunc(t,...r)})},`setClickFun`),Vt=j(function(e,t){Ke.push(function(){let n=K?`${K}-${e}`:e,r=document.querySelector(`[id="${n}"]`);r!==null&&r.addEventListener(`click`,function(){t()})},function(){let n=K?`${K}-${e}`:e,r=document.querySelector(`[id="${n}-text"]`);r!==null&&r.addEventListener(`click`,function(){t()})})},`pushFun`),Ht={getConfig:j(()=>P().gantt,`getConfig`),clear:Xe,setDateFormat:it,getDateFormat:dt,enableInclusiveEndDates:at,endDatesAreInclusive:ot,enableTopAxis:st,topAxisEnabled:ct,setAxisFormat:Qe,getAxisFormat:$e,setTickInterval:et,getTickInterval:tt,setTodayMarker:nt,getTodayMarker:rt,setAccTitle:re,getAccTitle:le,setDiagramTitle:ne,getDiagramTitle:ce,setDiagramId:Ze,setDisplayMode:lt,getDisplayMode:ut,setAccDescription:N,getAccDescription:se,addSection:vt,getSections:yt,getTasks:bt,addTask:Ft,findTaskById:Q,addTaskOrg:It,setIncludes:pt,getIncludes:mt,setExcludes:ht,getExcludes:gt,setClickEvent:j(function(e,t,n){e.split(`,`).forEach(function(e){Bt(e,t,n)}),zt(e,`clickable`)},`setClickEvent`),setLink:Rt,getLinks:_t,bindFunctions:j(function(e){Ke.forEach(function(t){t(e)})},`bindFunctions`),parseDuration:Ot,isInvalidDate:xt,setWeekday:St,getWeekday:Ct,setWeekend:wt};function Ut(e,t,n){let r=!0;for(;r;)r=!1,n.forEach(function(n){let i=`^\\s*`+n+`\\s*$`,a=new RegExp(i);e[0].match(a)&&(t[n]=!0,e.shift(1),r=!0)})}j(Ut,`getTaskTags`),z.default.extend(Ie.default);var Wt=j(function(){M.debug(`Something is calling, setConf, remove the call`)},`setConf`),Gt={monday:O,tuesday:_,wednesday:m,thursday:k,friday:y,saturday:A,sunday:b},Kt=j((e,t)=>{let n=[...e].map(()=>-1/0),r=[...e].sort((e,t)=>e.startTime-t.startTime||e.order-t.order),i=0;for(let e of r)for(let r=0;r<n.length;r++)if(e.startTime>=n[r]){n[r]=e.endTime,e.order=r+t,r>i&&(i=r);break}return i},`getMaxIntersections`),$,qt=1e4,Jt={parser:Re,db:Ht,renderer:{setConf:Wt,draw:j(function(e,t,n,r){let i=P().gantt;r.db.setDiagramId(t);let a=P().securityLevel,o;a===`sandbox`&&(o=f(`#i`+t));let s=f(a===`sandbox`?o.nodes()[0].contentDocument.body:`body`),c=a===`sandbox`?o.nodes()[0].contentDocument:document,l=c.getElementById(t);$=l.parentElement.offsetWidth,$===void 0&&($=1200),i.useWidth!==void 0&&($=i.useWidth);let u=r.db.getTasks(),d=u.filter(e=>!e.vert),p=[];for(let e of d)p.push(e.type);p=se(p);let m={},_=2*i.topPadding;if(r.db.getDisplayMode()===`compact`||i.displayMode===`compact`){let e={};for(let t of d)e[t.section]===void 0?e[t.section]=[t]:e[t.section].push(t);let t=0;for(let n of Object.keys(e)){let r=Kt(e[n],t)+1;t+=r,_+=r*(i.barHeight+i.barGap),m[n]=r}}else{_+=d.length*(i.barHeight+i.barGap);for(let e of p)m[e]=d.filter(t=>t.type===e).length}l.setAttribute(`viewBox`,`0 0 `+$+` `+_);let y=s.select(`[id="${t}"]`),b=E().domain([fe(u,function(e){return e.startTime}),de(u,function(e){return e.endTime})]).rangeRound([0,$-i.leftPadding-i.rightPadding]);function O(e,t){let n=e.startTime,r=t.startTime,i=0;return n>r?i=1:n<r&&(i=-1),i}j(O,`taskCompare`),u.sort(O),k(u,$,_),ae(y,_,$,i.useMaxWidth),y.append(`text`).text(r.db.getDiagramTitle()).attr(`x`,$/2).attr(`y`,i.titleTopMargin).attr(`class`,`titleText`);function k(e,t,n){let a=i.barHeight,o=a+i.barGap,s=i.topPadding,c=i.leftPadding,l=ee().domain([0,p.length]).range([`#00B9FA`,`#F95002`]).interpolate(je);te(o,s,c,t,n,e,r.db.getExcludes(),r.db.getIncludes()),ne(c,s,t,n),A(e,o,s,c,a,l,t,n),re(o,s,c,a,l),ie(c,s,t,n)}j(k,`makeGantt`);function A(e,n,a,o,s,c,l){e.sort((e,t)=>e.vert===t.vert?0:e.vert?1:-1);let u=e.filter(e=>!e.vert),d=[...new Set(u.map(e=>e.order))].map(e=>u.find(t=>t.order===e));y.append(`g`).selectAll(`rect`).data(d).enter().append(`rect`).attr(`x`,0).attr(`y`,function(e,t){return t=e.order,t*n+a-2}).attr(`width`,function(){return l-i.rightPadding/2}).attr(`height`,n).attr(`class`,function(e){for(let[t,n]of p.entries())if(e.type===n)return`section section`+t%i.numberSectionStyles;return`section section0`}).enter();let m=y.append(`g`).selectAll(`rect`).data(e).enter(),h=r.db.getLinks();if(m.append(`rect`).attr(`id`,function(e){return t+`-`+e.id}).attr(`rx`,3).attr(`ry`,3).attr(`x`,function(e){return e.milestone?b(e.startTime)+o+.5*(b(e.endTime)-b(e.startTime))-.5*s:b(e.startTime)+o}).attr(`y`,function(e,t){return t=e.order,e.vert?i.gridLineStartPadding:t*n+a}).attr(`width`,function(e){return e.milestone?s:e.vert?.08*s:b(e.renderEndTime||e.endTime)-b(e.startTime)}).attr(`height`,function(e){return e.vert?u.length*(i.barHeight+i.barGap)+i.barHeight*2:s}).attr(`transform-origin`,function(e,t){return t=e.order,(b(e.startTime)+o+.5*(b(e.endTime)-b(e.startTime))).toString()+`px `+(t*n+a+.5*s).toString()+`px`}).attr(`class`,function(e){let t=``;e.classes.length>0&&(t=e.classes.join(` `));let n=0;for(let[t,r]of p.entries())e.type===r&&(n=t%i.numberSectionStyles);let r=``;return e.active?e.crit?r+=` activeCrit`:r=` active`:e.done?r=e.crit?` doneCrit`:` done`:e.crit&&(r+=` crit`),r.length===0&&(r=` task`),e.milestone&&(r=` milestone `+r),e.vert&&(r=` vert `+r),r+=n,r+=` `+t,`task`+r}),m.append(`text`).attr(`id`,function(e){return t+`-`+e.id+`-text`}).text(function(e){return e.task}).attr(`font-size`,i.fontSize).attr(`x`,function(e){let t=b(e.startTime),n=b(e.renderEndTime||e.endTime);if(e.milestone&&(t+=.5*(b(e.endTime)-b(e.startTime))-.5*s,n=t+s),e.vert)return b(e.startTime)+o;let r=this.getBBox().width;return r>n-t?n+r+1.5*i.leftPadding>l?t+o-5:n+o+5:(n-t)/2+t+o}).attr(`y`,function(e,t){return e.vert?i.gridLineStartPadding+u.length*(i.barHeight+i.barGap)+60:(t=e.order,t*n+i.barHeight/2+(i.fontSize/2-2)+a)}).attr(`text-height`,s).attr(`class`,function(e){let t=b(e.startTime),n=b(e.endTime);e.milestone&&(n=t+s);let r=this.getBBox().width,a=``;e.classes.length>0&&(a=e.classes.join(` `));let o=0;for(let[t,n]of p.entries())e.type===n&&(o=t%i.numberSectionStyles);let c=``;return e.active&&(c=e.crit?`activeCritText`+o:`activeText`+o),e.done?c=e.crit?c+` doneCritText`+o:c+` doneText`+o:e.crit&&(c=c+` critText`+o),e.milestone&&(c+=` milestoneText`),e.vert&&(c+=` vertText`),r>n-t?n+r+1.5*i.leftPadding>l?a+` taskTextOutsideLeft taskTextOutside`+o+` `+c:a+` taskTextOutsideRight taskTextOutside`+o+` `+c+` width-`+r:a+` taskText taskText`+o+` `+c+` width-`+r}),P().securityLevel===`sandbox`){let e;e=f(`#i`+t);let n=e.nodes()[0].contentDocument;m.filter(function(e){return h.has(e.id)}).each(function(e){var r=n.querySelector(`#`+CSS.escape(t+`-`+e.id)),i=n.querySelector(`#`+CSS.escape(t+`-`+e.id+`-text`));let a=r.parentNode;var o=n.createElement(`a`);o.setAttribute(`xlink:href`,h.get(e.id)),o.setAttribute(`target`,`_top`),a.appendChild(o),o.appendChild(r),o.appendChild(i)})}}j(A,`drawRects`);function te(e,n,a,o,s,c,l,u){if(l.length===0&&u.length===0)return;let d,f;for(let{startTime:e,endTime:t}of c)(d===void 0||e<d)&&(d=e),(f===void 0||t>f)&&(f=t);if(!d||!f)return;if((0,z.default)(f).diff((0,z.default)(d),`year`)>5){M.warn(`The difference between the min and max time is more than 5 years. This will cause performance issues. Skipping drawing exclude days.`);return}let p=r.db.getDateFormat(),m=[],h=null,g=(0,z.default)(d);for(;g.valueOf()<=f;)r.db.isInvalidDate(g,p,l,u)?h?h.end=g:h={start:g,end:g}:h&&(m.push(h),h=null),g=g.add(1,`d`);y.append(`g`).selectAll(`rect`).data(m).enter().append(`rect`).attr(`id`,e=>t+`-exclude-`+e.start.format(`YYYY-MM-DD`)).attr(`x`,e=>b(e.start.startOf(`day`))+a).attr(`y`,i.gridLineStartPadding).attr(`width`,e=>b(e.end.endOf(`day`))-b(e.start.startOf(`day`))).attr(`height`,s-n-i.gridLineStartPadding).attr(`transform-origin`,function(t,n){return(b(t.start)+a+.5*(b(t.end)-b(t.start))).toString()+`px `+(n*e+.5*s).toString()+`px`}).attr(`class`,`exclude-range`)}j(te,`drawExcludeDays`);function N(e,t,n,r){if(n<=0||e>t)return 1/0;let i=t-e,a=z.default.duration({[r??`day`]:n}).asMilliseconds();return a<=0?1/0:Math.ceil(i/a)}j(N,`getEstimatedTickCount`);function ne(e,t,n,a){let o=r.db.getDateFormat(),s=r.db.getAxisFormat(),c;c=s||(o===`D`?`%d`:i.axisFormat??`%Y-%m-%d`);let l=D(b).tickSize(-a+t+i.gridLineStartPadding).tickFormat(x(c)),u=/^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/.exec(r.db.getTickInterval()||i.tickInterval);if(u!==null){let e=parseInt(u[1],10);if(isNaN(e)||e<=0)M.warn(`Invalid tick interval value: "${u[1]}". Skipping custom tick interval.`);else{let t=u[2],n=r.db.getWeekday()||i.weekday,a=b.domain(),o=a[0],s=a[1],c=N(o,s,e,t);if(c>qt)M.warn(`The tick interval "${e}${t}" would generate ${c} ticks, which exceeds the maximum allowed (${qt}). This may indicate an invalid date or time range. Skipping custom tick interval.`);else switch(t){case`millisecond`:l.ticks(g.every(e));break;case`second`:l.ticks(w.every(e));break;case`minute`:l.ticks(T.every(e));break;case`hour`:l.ticks(h.every(e));break;case`day`:l.ticks(v.every(e));break;case`week`:l.ticks(Gt[n].every(e));break;case`month`:l.ticks(S.every(e))}}}if(y.append(`g`).attr(`class`,`grid`).attr(`transform`,`translate(`+e+`, `+(a-50)+`)`).call(l).selectAll(`text`).style(`text-anchor`,`middle`).attr(`fill`,`#000`).attr(`stroke`,`none`).attr(`font-size`,10).attr(`dy`,`1em`),r.db.topAxisEnabled()||i.topAxis){let n=C(b).tickSize(-a+t+i.gridLineStartPadding).tickFormat(x(c));if(u!==null){let e=parseInt(u[1],10);if(isNaN(e)||e<=0)M.warn(`Invalid tick interval value: "${u[1]}". Skipping custom tick interval.`);else{let t=u[2],a=r.db.getWeekday()||i.weekday,o=b.domain(),s=o[0],c=o[1];if(N(s,c,e,t)<=qt)switch(t){case`millisecond`:n.ticks(g.every(e));break;case`second`:n.ticks(w.every(e));break;case`minute`:n.ticks(T.every(e));break;case`hour`:n.ticks(h.every(e));break;case`day`:n.ticks(v.every(e));break;case`week`:n.ticks(Gt[a].every(e));break;case`month`:n.ticks(S.every(e))}}}y.append(`g`).attr(`class`,`grid`).attr(`transform`,`translate(`+e+`, `+t+`)`).call(n).selectAll(`text`).style(`text-anchor`,`middle`).attr(`fill`,`#000`).attr(`stroke`,`none`).attr(`font-size`,10)}}j(ne,`makeGrid`);function re(e,t){let n=0,r=Object.keys(m).map(e=>[e,m[e]]);y.append(`g`).selectAll(`text`).data(r).enter().append(function(e){let t=e[0].split(oe.lineBreakRegex),n=-(t.length-1)/2,r=c.createElementNS(`http://www.w3.org/2000/svg`,`text`);r.setAttribute(`dy`,n+`em`);for(let[e,n]of t.entries()){let t=c.createElementNS(`http://www.w3.org/2000/svg`,`tspan`);t.setAttribute(`alignment-baseline`,`central`),t.setAttribute(`x`,`10`),e>0&&t.setAttribute(`dy`,`1em`),t.textContent=n,r.appendChild(t)}return r}).attr(`x`,10).attr(`y`,function(i,a){if(a>0)for(let o=0;o<a;o++)return n+=r[a-1][1],i[1]*e/2+n*e+t;else return i[1]*e/2+t}).attr(`font-size`,i.sectionFontSize).attr(`class`,function(e){for(let[t,n]of p.entries())if(e[0]===n)return`sectionTitle sectionTitle`+t%i.numberSectionStyles;return`sectionTitle`})}j(re,`vertLabels`);function ie(e,t,n,a){let o=r.db.getTodayMarker();if(o===`off`)return;let s=y.append(`g`).attr(`class`,`today`),c=new Date,l=s.append(`line`);l.attr(`x1`,b(c)+e).attr(`x2`,b(c)+e).attr(`y1`,i.titleTopMargin).attr(`y2`,a-i.titleTopMargin).attr(`class`,`today`),o!==``&&l.attr(`style`,o.replace(/,/g,`;`))}j(ie,`drawToday`);function se(e){let t={},n=[];for(let r=0,i=e.length;r<i;++r)Object.prototype.hasOwnProperty.call(t,e[r])||(t[e[r]]=!0,n.push(e[r]));return n}j(se,`checkUnique`)},`draw`)},styles:j(e=>`
  .mermaid-main-font {
        font-family: ${e.fontFamily};
  }

  .exclude-range {
    fill: ${e.excludeBkgColor};
  }

  .section {
    stroke: none;
    opacity: 0.2;
  }

  .section0 {
    fill: ${e.sectionBkgColor};
  }

  .section2 {
    fill: ${e.sectionBkgColor2};
  }

  .section1,
  .section3 {
    fill: ${e.altSectionBkgColor};
    opacity: 0.2;
  }

  .sectionTitle0 {
    fill: ${e.titleColor};
  }

  .sectionTitle1 {
    fill: ${e.titleColor};
  }

  .sectionTitle2 {
    fill: ${e.titleColor};
  }

  .sectionTitle3 {
    fill: ${e.titleColor};
  }

  .sectionTitle {
    text-anchor: start;
    font-family: ${e.fontFamily};
  }


  /* Grid and axis */

  .grid .tick {
    stroke: ${e.gridColor};
    opacity: 0.8;
    shape-rendering: crispEdges;
  }

  .grid .tick text {
    font-family: ${e.fontFamily};
    fill: ${e.textColor};
  }

  .grid path {
    stroke-width: 0;
  }


  /* Today line */

  .today {
    fill: none;
    stroke: ${e.todayLineColor};
    stroke-width: 2px;
  }


  /* Task styling */

  /* Default task */

  .task {
    stroke-width: 2;
  }

  .taskText {
    text-anchor: middle;
    font-family: ${e.fontFamily};
  }

  .taskTextOutsideRight {
    fill: ${e.taskTextDarkColor};
    text-anchor: start;
    font-family: ${e.fontFamily};
  }

  .taskTextOutsideLeft {
    fill: ${e.taskTextDarkColor};
    text-anchor: end;
  }


  /* Special case clickable */

  .task.clickable {
    cursor: pointer;
  }

  .taskText.clickable {
    cursor: pointer;
    fill: ${e.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideLeft.clickable {
    cursor: pointer;
    fill: ${e.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideRight.clickable {
    cursor: pointer;
    fill: ${e.taskTextClickableColor} !important;
    font-weight: bold;
  }


  /* Specific task settings for the sections*/

  .taskText0,
  .taskText1,
  .taskText2,
  .taskText3 {
    fill: ${e.taskTextColor};
  }

  .task0,
  .task1,
  .task2,
  .task3 {
    fill: ${e.taskBkgColor};
    stroke: ${e.taskBorderColor};
  }

  .taskTextOutside0,
  .taskTextOutside2
  {
    fill: ${e.taskTextOutsideColor};
  }

  .taskTextOutside1,
  .taskTextOutside3 {
    fill: ${e.taskTextOutsideColor};
  }


  /* Active task */

  .active0,
  .active1,
  .active2,
  .active3 {
    fill: ${e.activeTaskBkgColor};
    stroke: ${e.activeTaskBorderColor};
  }

  .activeText0,
  .activeText1,
  .activeText2,
  .activeText3 {
    fill: ${e.taskTextDarkColor} !important;
  }


  /* Completed task */

  .done0,
  .done1,
  .done2,
  .done3 {
    stroke: ${e.doneTaskBorderColor};
    fill: ${e.doneTaskBkgColor};
    stroke-width: 2;
  }

  .doneText0,
  .doneText1,
  .doneText2,
  .doneText3 {
    fill: ${e.taskTextDarkColor} !important;
  }

  /* Done task text displayed outside the bar sits against the diagram background,
     not against the done-task bar, so it must use the outside/contrast color. */
  .doneText0.taskTextOutsideLeft,
  .doneText0.taskTextOutsideRight,
  .doneText1.taskTextOutsideLeft,
  .doneText1.taskTextOutsideRight,
  .doneText2.taskTextOutsideLeft,
  .doneText2.taskTextOutsideRight,
  .doneText3.taskTextOutsideLeft,
  .doneText3.taskTextOutsideRight {
    fill: ${e.taskTextOutsideColor} !important;
  }


  /* Tasks on the critical line */

  .crit0,
  .crit1,
  .crit2,
  .crit3 {
    stroke: ${e.critBorderColor};
    fill: ${e.critBkgColor};
    stroke-width: 2;
  }

  .activeCrit0,
  .activeCrit1,
  .activeCrit2,
  .activeCrit3 {
    stroke: ${e.critBorderColor};
    fill: ${e.activeTaskBkgColor};
    stroke-width: 2;
  }

  .doneCrit0,
  .doneCrit1,
  .doneCrit2,
  .doneCrit3 {
    stroke: ${e.critBorderColor};
    fill: ${e.doneTaskBkgColor};
    stroke-width: 2;
    cursor: pointer;
    shape-rendering: crispEdges;
  }

  .milestone {
    transform: rotate(45deg) scale(0.8,0.8);
  }

  .milestoneText {
    font-style: italic;
  }
  .doneCritText0,
  .doneCritText1,
  .doneCritText2,
  .doneCritText3 {
    fill: ${e.taskTextDarkColor} !important;
  }

  /* Done-crit task text outside the bar \u2014 same reasoning as doneText above. */
  .doneCritText0.taskTextOutsideLeft,
  .doneCritText0.taskTextOutsideRight,
  .doneCritText1.taskTextOutsideLeft,
  .doneCritText1.taskTextOutsideRight,
  .doneCritText2.taskTextOutsideLeft,
  .doneCritText2.taskTextOutsideRight,
  .doneCritText3.taskTextOutsideLeft,
  .doneCritText3.taskTextOutsideRight {
    fill: ${e.taskTextOutsideColor} !important;
  }

  .vert {
    stroke: ${e.vertLineColor};
  }

  .vertText {
    font-size: 15px;
    text-anchor: middle;
    fill: ${e.vertLineColor} !important;
  }

  .activeCritText0,
  .activeCritText1,
  .activeCritText2,
  .activeCritText3 {
    fill: ${e.taskTextDarkColor} !important;
  }

  .titleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${e.titleColor||e.textColor};
    font-family: ${e.fontFamily};
  }
`,`getStyles`)};export{Jt as diagram};