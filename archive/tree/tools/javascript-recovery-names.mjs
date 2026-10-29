// Names inferred from the shipped glue's implementations and public Module exports.
// Each table is deliberately file-specific: Closure used different alphabets per build.
const pairs = text => Object.assign(Object.create(null), Object.fromEntries(text.trim().split(/\s+/).map(pair => pair.split('='))));
export const commonFunctionLocals = {
  emscripten_memcpy_big: ['destination', 'source', 'length'],
  quit: ['status', 'exception'], allocateUTF8String: ['text'], locateFile: ['filename'], warnOnce: ['message'],
  assert: ['condition', 'message'], UTF8ArrayToString: ['bytes', 'index', 'maxBytesToRead'], UTF8ToString: ['pointer', 'maxBytesToRead'],
  stringToUTF8Array: ['text', 'outputBytes', 'outputIndex', 'maxBytesToWrite'], stringToUTF8: ['text', 'outputPointer', 'maxBytesToWrite'],
  lengthBytesUTF8: ['text'], allocateUTF8: ['text'], abort: ['reason'], isDataURI: ['filename'], getBinary: ['filename'],
  callRuntimeCallbacks: ['callbacks'], dynCall: ['signature', 'functionPointer', 'argumentsList'], getRandomDevice: [],
  emscripten_set_main_loop_timing: ['mode', 'value'], setMainLoop: ['callback', 'fps', 'simulateInfiniteLoop', 'argument', 'noSetTiming'],
  callUserCallback: ['callback', 'synchronous'], safeSetTimeout: ['callback', 'delay'], emscripten_asm_const_int: ['codePointer', 'signaturePointer', 'argumentPointer'],
  findEventTarget: ['target'], getCanvasElementSize: ['canvas'], setCanvasElementSize: ['target', 'width', 'height'],
  setCanvasElementSizeCallingThread: ['canvas', 'width', 'height'], registerRestoreOldStyle: ['canvas'],
  setLetterbox: ['canvas', 'topBottom', 'leftRight'], getBoundingClientRect: ['element'], requestFullscreen: ['canvas', 'strategy'],
  requestPointerLock: ['target'], fillGamepadEventData: ['eventPointer', 'gamepad'],
  glGenObjects: ['count', 'outputPointer', 'createFunction', 'objectTable'],
  glGetActiveAttribOrUniform: ['queryFunction', 'program', 'index', 'bufferSize', 'lengthPointer', 'sizePointer', 'typePointer', 'namePointer'],
  writeI53ToI64: ['pointer', 'value'], emscriptenWebGLGet: ['parameter', 'outputPointer', 'outputType'],
  emscriptenWebGLGetIndexed: ['parameter', 'index', 'outputPointer', 'outputType'], stringToNewUTF8: ['text'],
  webglGetLeftBracePos: ['name'], webglPrepareUniformLocationsBeforeFirstUse: ['program'], webglGetUniformLocation: ['location'],
  emscriptenWebGLGetUniform: ['program', 'location', 'outputPointer', 'outputType'], emscriptenWebGLGetVertexAttrib: ['index', 'parameter', 'outputPointer', 'outputType'],
  heapObjectForWebGLType: ['type'], toTypedArrayIndex: ['typedArray'], emscripten_request_fullscreen_strategy: ['target', 'strategy'],
  fillMouseEventData: ['eventPointer', 'event', 'target'], getentropy: ['pointer', 'length'], isLeapYear: ['year'],
  arraySum: ['array', 'endIndex'], addDays: ['date', 'days'], strftime: ['outputPointer', 'maxSize', 'formatPointer', 'timePointer'],
  intArrayFromString: ['text', 'omitTerminator', 'length'], ExitStatus: ['status'], exit: ['status'],
  hexDigitToCharCode: ['digit'], copyTextToClipboard: ['text'], setValue: ['pointer', 'value', 'type'],
  addEventListenerOnce: ['target', 'eventType', 'callback'], autoResumeAudioContext: ['audioContext', 'elements'],
  asyncLoad: ['url', 'onload', 'onerror', 'noRunDependency'],
};
const eventFunctions = ['registerBeforeUnloadEventCallback','registerFocusEventCallback','registerFullscreenChangeEventCallback','registerGamepadEventCallback','registerKeyEventCallback','registerMouseEventCallback','registerPointerlockChangeEventCallback','registerUiEventCallback','registerTouchEventCallback','registerVisibilityChangeEventCallback','registerWheelEventCallback'];
for (const name of eventFunctions) commonFunctionLocals[name] = ['target','userData','useCapture','callbackPointer','eventTypeId','eventType'];
export const specs = {
 client: {
  module: 'm', wrapperUndefined: 'A', imports: 'Ic', asmConsts: 'tc',
  names: pairs(`m=clientModule zb=FSNode $a=quit da=allocateUTF8String W=hexDigitToCharCode mc=reloadPage Ab=copyTextToClipboard nc=locateFile qa=warnOnce Bb=setValue Fa=assert na=UTF8ArrayToString G=UTF8ToString Ga=stringToUTF8Array J=stringToUTF8 oa=lengthBytesUTF8 Ha=allocateUTF8 ab=addRunDependency Ia=removeRunDependency N=abort Db=isDataURI Eb=getBinary oc=getBinaryPromise pc=addEventListenerOnce qc=autoResumeAudioContext Ja=callRuntimeCallbacks db=dynCall Gb=getRandomDevice rc=asyncLoad ta=emscripten_set_main_loop_timing Hb=setMainLoop fb=callUserCallback Jb=safeSetTimeout Kb=emscripten_asm_const_int S=findEventTarget Lb=getCanvasElementSize Mb=setCanvasElementSize Nb=setCanvasElementSizeCallingThread uc=registerRestoreOldStyle jb=setLetterbox Oa=getBoundingClientRect kb=requestFullscreen lb=requestPointerLock Ob=fillGamepadEventData ba=glGenObjects Pb=glGetActiveAttribOrUniform wa=writeI53ToI64 Pa=emscriptenWebGLGet Qb=emscriptenWebGLGetIndexed xa=stringToNewUTF8 Rb=webglGetLeftBracePos Sb=webglPrepareUniformLocationsBeforeFirstUse F=webglGetUniformLocation mb=emscriptenWebGLGetUniform Qa=emscriptenWebGLGetVertexAttrib ya=heapObjectForWebGLType za=toTypedArrayIndex yc=emscripten_request_fullscreen_strategy zc=registerBeforeUnloadEventCallback Ub=registerFocusEventCallback Vb=registerFullscreenChangeEventCallback Wb=registerGamepadEventCallback nb=registerKeyEventCallback Xb=fillMouseEventData Aa=registerMouseEventCallback Ra=registerPointerlockChangeEventCallback Ac=registerUiEventCallback Sa=registerTouchEventCallback Bc=registerVisibilityChangeEventCallback Cc=registerWheelEventCallback Ba=getEnvStrings Ta=getentropy Ua=isLeapYear pb=arraySum Va=addDays Dc=strftime qb=intArrayFromString Ka=ExitStatus rb=run eb=exit
  aa=webSockets y=canvasContexts Ca=freeCanvasContextIds V=paths sb=freePathIds tb=ubuntuFontLoaded ub=canvasTextDecoder Fc=fontDetector vb=rtcPeerConnections Za=rtcDataChannels Da=moduleOverrides fa=moduleProperty Yb=thisProgram ha=scriptDirectory Fb=readBinary ic=readTextSync sc=readAsync jc=setWindowTitle wb=out L=err sa=wasmBinary Ib=noExitRuntime kc=wasmMemory ja=ABORT cb=EXITSTATUS Cb=UTF8Decoder lc=wasmMemoryBuffer P=HEAP8 Q=HEAPU8 ma=HEAP16 Tb=HEAPU16 l=HEAP32 T=HEAPU32 E=HEAPF32 Y=HEAPF64 M=wasmTable bc=preRunCallbacks Zb=initCallbacks Ec=preMainCallbacks Gc=exitCallbacks ac=postRunCallbacks ia=runDependencies bb=runDependencyWatcher ra=dependenciesFulfilled Z=wasmBinaryFile K=tempDouble X=tempI64 tc=ASM_CONSTS H=PATH ca=PATH_FS ea=TTY D=MEMFS f=FS O=SYSCALLS ua=emscripten_get_now r=Browser x=EGL n=GL gb=asmArguments la=FetchRegistry w=JSEvents Na=fullscreenStrategy La=specialHTMLTargets pa=tempFixedLengthArray Hc=powerPreferenceValues ob=ENV Wa=MONTH_DAYS_LEAP Xa=MONTH_DAYS_REGULAR k=GLctx yb=tempArraySize Ic=wasmImports ka=free R=malloc ec=cp6_mouse_wheel xb=cp6_canvas_context_lost dc=cp6_browser_quit_confirmation Ea=cp6_check_ws fc=cp6_force_disconnect gc=cp6_force_server_id cc=cp6_set_clipboard_callback hc=webRTCProxyClosed hb=stackSave ib=stackRestore va=stackAlloc Ya=calledRun $b=shouldRunNow`),
  properties: pairs(`vg=mount Zh=mounted og=node_ops rg=stream_ops ci=rdev Ql=nextInode zj=shownWarnings xk=envStrings rk=randomDevice
  vk=splitPath qj=normalizeArray jh=basename Sm=extname uh=join2 sk=relative Bk=ttys Gh=ops Gg=output wg=tty $j=get_char sj=put_char el=default_tty_ops dl=default_tty1_ops dh=ops_table Ym=getFileDataAsTypedArray Rj=expandFileStorage dm=resizeFileStorage Zg=getattr Eg=setattr vh=lookup ah=mknod ei=rename Lh=unlink fi=rmdir di=readdir ph=symlink nh=readlink $g=llseek Qh=allocate Yh=mmap Eh=msync Jj=chrdev qg=contents ug=usedBytes $h=mounts Oj=devices bh=nameTable Mj=currentPath ij=initialized ck=ignorePermissions zg=trackingDelegate lg=ErrnoError bj=genericErrors ol=filesystems Ji=syncFSRequests tg=lookupPath lh=getPath gj=hashName ak=hashAddNode bk=hashRemoveNode hh=lookupNode Zi=destroyNode xi=isRoot th=isMountpoint Dg=isDir Wh=isLink vi=isChrdev El=isBlkdev Gl=isFIFO an=isSocket ql=flagModes Ll=modeStringToFlags Sj=flagsToPermissionString mh=nodePermissions Il=mayLookup oj=mayCreate Di=mayDelete Jl=mayOpen sh=getStream vj=registerDevice ti=cwd Hk=FSNode Hl=isFolder ek=isDevice xh=name_next ik=mountpoint Qg=follow aj=follow_mount uj=recurse_count zh=fd Ig=errno
  hn=mappings ym=calculateAt Qm=doStat Om=doMsync Mm=doMkdir Nm=doMknod Pm=doReadlink Km=doAccess Lm=doDup il=doReadv jl=doWritev Mh=varargs wl=getStr Bh=getStreamFromFD Xm=get64 hl=dev jj=ino Sl=nlink xl=gid Nk=blocks Lk=atime Pl=mtime Yk=ctime
  ng=mainLoop xj=timingSet oh=scheduler si=currentlyRunningMainloop Yg=func Ug=arg Ki=timingMode Li=timingValue Wi=currentFrameNumber qk=queue wj=remainingBlockers Rm=expectedBlockers Cm=counted mm=tickStartTime tm=updateStatus fm=runIter Vh=isFullscreen rj=pointerLock hk=moduleContextCreatedCallbacks Nh=workers Dl=initted ui=hasBlobConstructor li=URL gh=init Sh=createContext zi=lockPointer Ih=resizeCanvas Im=destroyContext Wj=fullscreenHandlersInstalled Fh=nextRAF nl=fakeRequestAnimationFrame Bn=safeCallback An=safeRequestAnimationFrame cj=getMimetype sl=getMovementX tl=getMovementY Zm=getMouseWheelDelta Ch=mouseX Dh=mouseY ai=mouseMovementX bi=mouseMovementY gk=lastTouches zm=calculateMouseEvent em=resizeListeners Cj=updateResizeListeners gm=setCanvasSize Nn=windowedWidth Mn=windowedHeight im=setFullscreenCanvasSize jm=setWindowedCanvasSize ki=updateCanvasDimensions
  mg=recordError lj=lastError Ah=getNewId rh=buffers sg=programs Th=framebuffers Hh=renderbuffers yh=textures Fg=shaders eh=vaos Vg=contexts yg=queries Tg=samplers ii=transformFeedbacks qh=syncs wk=stringiCache sm=unpackAlignment vl=getSource Zl=registerContext Xh=makeContextCurrent gl=deleteContext Bl=initExtensions Bg=currentContext nj=majorVersion ih=GLctx Ph=GLcontext Pj=enableExtensionsByDefault $m=handle Cl=initExtensionsDone ji=uniformLocsById Dk=uniformArrayNamesById Ek=uniformSizeAndIdsByName Bj=uniformIdCounter al=currentProgram
  hj=inEventHandler am=removeAllEventListeners $l=registerRemoveEventListeners Og=deferredCalls Nj=deferCall tk=removeDeferredCalls Ti=canPerformEventHandlerRequests uk=runDeferredCalls Pg=eventHandlers bm=removeAllHandlersOnTarget Ri=removeHandler Sg=registerOrRemoveHandler ej=getNodeNameForTarget cm=removeEventListenersRegistered $k=currentEventHandler Aj=targetFunction Fj=argsList pk=precedence Cg=eventTypeString Ng=callbackfunc Rg=handlerFunc Mg=useCapture ll=eventListenerFunc Rh=allowsDeferredCalls Tj=focusEvent Vj=fullscreenChangeEvent Xj=gamepadEvent fk=keyEvent pj=mouseEvent nk=pointerlockChangeEvent Ck=uiEvent zk=touchEvent Fk=visibilityChangeEvent Gk=wheelEvent Xl=previousFullscreenElement Fl=isChanged Tl=onTarget
  fh=eventQueue tn=onFontLoaded wi=isFontLoaded Ln=whichFont Nl=checkInterval Ol=timeout`),
 },
 sp_server: {
  module: 'd', wrapperUndefined: 'x', imports:'Va', asmConsts:'Na',
  names: pairs(`d=serverModule ba=quit ra=allocateUTF8String La=locateFile H=warnOnce da=assert O=UTF8ArrayToString sa=stringToUTF8Array D=abort ua=isDataURI va=getBinary Ma=getBinaryPromise P=callRuntimeCallbacks xa=emscripten_asm_const_int ia=emscripten_set_main_loop_timing Oa=setMainLoop ja=callUserCallback Ca=safeSetTimeout J=getEnvStrings Pa=getRandomDevice R=getentropy S=isLeapYear la=arraySum T=addDays Qa=strftime Ra=intArrayFromString Q=ExitStatus ma=run Ba=exit Ta=webSockets oa=rtcPeerConnections Y=rtcDataChannels L=moduleOverrides B=moduleProperty Da=thisProgram C=scriptDirectory wa=readTextSync Ua=out z=err I=wasmBinary Aa=noExitRuntime Ja=wasmMemory G=ABORT ea=EXITSTATUS ta=UTF8Decoder K=HEAP8 w=HEAPU8 r=HEAP32 Z=HEAPU32 ya=HEAPF64 fa=wasmTable Ia=preRunCallbacks Fa=initCallbacks Sa=preMainCallbacks Ha=postRunCallbacks na=runtimeInitialized F=runDependencies pa=runDependencyWatcher M=dependenciesFulfilled y=wasmBinaryFile Na=ASM_CONSTS ha=asmArguments za=emscripten_get_now e=Browser ka=ENV N=SYSCALLS U=MONTH_DAYS_LEAP V=MONTH_DAYS_REGULAR Va=wasmImports ca=malloc X=free Ka=sp_server_think W=calledRun Ga=shouldRunNow aa=workerResponded qa=workerCallbackId`),
  properties: pairs(`fa=shownWarnings pa=envStrings oa=randomDevice ra=eventQueue
  A=mainLoop ea=timingSet C=scheduler S=currentlyRunningMainloop F=func D=arg W=timingMode X=timingValue aa=currentFrameNumber na=queue da=remainingBlockers Ra=expectedBlockers Pa=counted Ga=tickStartTime La=updateStatus Ca=runIter L=isFullscreen ca=pointerLock ya=moduleContextCreatedCallbacks gb=workers xa=initted T=hasBlobConstructor R=URL wa=init ia=createContext Qa=destroyContext ka=fullscreenHandlersInstalled U=lockPointer J=resizeCanvas I=nextRAF sa=fakeRequestAnimationFrame $a=safeCallback Za=safeRequestAnimationFrame ba=getMimetype ta=getMovementX ua=getMovementY Ta=getMouseWheelDelta G=mouseX H=mouseY M=mouseMovementX N=mouseMovementY la=lastTouches Oa=calculateMouseEvent Ba=resizeListeners ga=updateResizeListeners Da=setCanvasSize fb=windowedWidth eb=windowedHeight Ea=setFullscreenCanvasSize Fa=setWindowedCanvasSize P=updateCanvasDimensions
  Ja=tm_sec Ia=tm_min Y=tm_hour O=tm_mday K=tm_mon B=tm_year Z=tm_wday $=tm_yday ab=tm_isdst Ha=tm_gmtoff Ka=tm_zone
  qa=buffers za=printChar ha=varargs Ua=getStr Sa=get64`),
 },
};
Object.assign(commonFunctionLocals, {
 FSNode:['parent','name','mode','device'], splitPath:['filename'], normalizeArray:['parts','allowAboveRoot'], normalize:['filename'], dirname:['filename'], basename:['filename'], extname:['filename'], join2:['left','right'], relative:['from','to'],
 register:['device','operations'], createNode:['parent','name','mode','device'], getFileDataAsTypedArray:['node'], expandFileStorage:['node','newCapacity'], resizeFileStorage:['node','newSize'],
 getattr:['node'], setattr:['node','attributes'], lookup:['parent','name'], mknod:['parent','name','mode','device'], rename:['oldNode','newParent','newName'], unlink:['parent','name'], rmdir:['parent','name'], readdir:['node'], symlink:['parent','newName','oldPath'], readlink:['node'],
 lookupPath:['filename','options'], getPath:['node'], hashName:['parentId','name'], hashAddNode:['node'], hashRemoveNode:['node'], lookupNode:['parent','name'], destroyNode:['node'], isRoot:['node'], isMountpoint:['node'],
 isFile:['mode'], isDir:['mode'], isLink:['mode'], isChrdev:['mode'], isBlkdev:['mode'], isFIFO:['mode'], isSocket:['mode'], modeStringToFlags:['mode'], flagsToPermissionString:['flags'], nodePermissions:['node','permissions'], mayLookup:['directory'], mayCreate:['directory','name'], mayDelete:['directory','name','isDirectory'], mayOpen:['node','flags'], getStream:['fd'], registerDevice:['device','operations'],
 calculateAt:['directoryFd','filename','allowEmpty'], doStat:['statFunction','filename','outputPointer'], doMsync:['address','stream','length','flags','offset'], doMkdir:['filename','mode'], doMknod:['filename','mode','device'], doReadlink:['filename','outputPointer','bufferSize'], doAccess:['filename','accessMode'], doDup:['filename','flags','newFd'], doReadv:['stream','iovecPointer','iovecCount','offset'], doWritev:['stream','iovecPointer','iovecCount','offset'], getStr:['pointer'], getStreamFromFD:['fd'], get64:['value'],
 read:['stream','buffer','offset','length','position'], write:['stream','buffer','offset','length','position','canOwn'], llseek:['stream','offset','whence'], mmap:['stream','address','length','position','protection','flags'], msync:['stream','buffer','offset','length','flags'],
 createContext:['canvas','useWebGL','setInModule','attributes'], destroyContext:['canvas'], getMimetype:['filename'], getMovementX:['event'], getMovementY:['event'], getMouseWheelDelta:['event'], calculateMouseEvent:['event'], setCanvasSize:['width','height','noUpdates'], updateCanvasDimensions:['canvas','width','height'], fakeRequestAnimationFrame:['callback'], safeRequestAnimationFrame:['callback'], runIter:['callback'],
 recordError:['errorCode'], getNewId:['objectTable'], getSource:['shader','count','stringPointers','lengthPointers'], registerContext:['context','attributes'], makeContextCurrent:['handle'], getContext:['handle'], deleteContext:['handle'], initExtensions:['context'],
 deferCall:['targetFunction','precedence','argumentsList'], removeDeferredCalls:['targetFunction'], removeAllHandlersOnTarget:['target','eventType'], removeHandler:['index'], registerOrRemoveHandler:['handler'], getNodeNameForTarget:['target'], onFontLoaded:['font','onload','onerror','options'], isFontLoaded:['font'], whichFont:['element'],
});
const bridge = text => Object.fromEntries(text.trim().split('\n').map(line=>{const [address,name,...parameters]=line.trim().split(/\s+/);return [address,{name,parameters}]}));
specs.client.bridges = bridge(`
133644 isHttps
133686 allocateServerHostname
133733 isMobileUserAgent
133975 isTabletUserAgent
134075 isAppleUserAgent
134225 reloadWithVersion versionPointer
134434 reloadAfterDelay
134467 createCanvasOverlay
134676 getWindowInnerWidth
134706 getWindowInnerHeight
134737 resizeCanvasOverlay
135007 localStorageSet keyPointer valuePointer
135069 localStorageGet keyPointer
135144 supportsOffscreenCanvas
135298 createOffscreenCanvas width height
135607 createCanvas width height
135960 setCanvasDirectionLtr contextId
136033 destroyCanvas contextId
136194 supportsContextLossDetection
136300 canvasSave contextId
136329 canvasRestore contextId
136361 canvasResetTransform contextId
136414 canvasSetTransform contextId a b c d e f
136473 canvasResize contextId width height
136554 canvasGetSize contextId widthPointer heightPointer
136661 canvasFill contextId
136690 canvasFillPath contextId pathId
136732 canvasStroke contextId
136763 canvasStrokePath contextId pathId
136807 canvasClip contextId
136836 canvasClipPath contextId pathId
136878 canvasBeginPath contextId
136912 canvasClosePath contextId
136946 canvasRect contextId x y width height
136989 canvasClear contextId
137096 canvasFillUnitRect contextId
137139 canvasStrokeRect contextId width height
137186 canvasSetFillRgb contextId red green blue
137456 canvasSetStrokeRgb contextId red green blue
137728 canvasSetGlobalAlpha contextId alpha
137767 canvasSetGlobalAlphaDuplicate contextId alpha
137806 canvasMoveTo contextId x y
137843 canvasLineTo contextId x y
137880 canvasQuadraticCurveTo contextId controlX controlY x y
137935 canvasBezierCurveTo contextId control1X control1Y control2X control2Y x y
137995 canvasArc contextId x y radius startAngle endAngle counterclockwise
138047 canvasEllipse contextId x y radiusX radiusY rotation startAngle endAngle counterclockwise
138111 canvasSetLineWidth contextId width
138148 canvasDrawImage contextId sourceContextId
138211 canvasDrawImageUnit contextId sourceContextId
138280 canvasDrawImageRegionToUnit contextId sourceContextId sourceX sourceY sourceWidth sourceHeight
138365 canvasFillText contextId textPointer byteLength x y
138434 canvasStrokeText contextId textPointer byteLength x y
138505 canvasMeasureText contextId textPointer byteLength
138582 canvasSetUbuntuFont contextId size
138648 canvasSetTextAlignCenter contextId
138691 canvasSetLineCapButt contextId
138730 canvasSetLineCapRound contextId
138770 canvasSetLineCapSquare contextId
138811 canvasSetLineJoinRound contextId
138852 canvasSetLineJoinMiter contextId
138893 canvasSetMiterLimit contextId limit
138931 canvasSetTextBaselineMiddle contextId
138977 canvasSetTextBaselineAlphabetic contextId
139027 canvasSetCompositeSourceOver contextId
139092 getCanvasContextById elementIdPointer alpha
139312 isUbuntuFontReady
139414 webSocketCreate urlPointer
140167 webSocketDestroy socketId
140393 webSocketIsOpen socketId
140437 webSocketSend socketId dataPointer byteLength
140574 webSocketPopEvent socketId dataPointerPointer byteLengthPointer
140726 isHttpsDuplicate
140768 allocateUserAgent
140817 allocateDocumentReferrer
140864 allocateNavigatorLanguage
140912 copyTextToClipboard textPointer
140952 copyTextToClipboardDuplicate textPointer
140992 setCursorDefault
141056 setCursorPointer
141120 setCursorText
141181 promptAndAllocateResult defaultTextPointer
141250 supportsPerformanceNow
141314 getTimestamp usePerformanceNow
141362 openDiscord
141464 openReddit
141569 pathDestroy pathId
141620 pathCreate
141801 pathMoveTo pathId x y
141835 pathLineTo pathId x y
141869 pathArc pathId x y radius startAngle endAngle counterclockwise
141918 pathQuadraticCurveTo pathId controlX controlY x y
141970 pathBezierCurveTo pathId control1X control1Y control2X control2Y x y
142027 pathClose pathId
142058 isLocalStorageUnavailable
142130 canvasIsContextLost contextId
142175 isHttpsForSDL
142217 showAlert titlePointer messagePointer
142274 presentSDLPixelBuffer width height pixelPointer
143729 createColorCursor width height hotspotX hotspotY pixelPointer
144718 setCursorCss cursorPointer
144811 hideCursor
144880 getScreenWidth
144905 getScreenHeight
144931 getWindowInnerWidthForSDL
144961 getWindowInnerHeightForSDL
144992 setWindowTitle titlePointer
145087 supportsWebAudio
145224 supportsAudioCapture
145448 initializeSDLAudio capture
145941 getSDLAudioSampleRate
146009 openSDLAudioCapture channels bufferSize callbackPointer userData
147661 openSDLAudioOutput channels bufferSize callbackPointer userData
148071 readSDLAudioCapture outputPointer sampleCount
148676 writeSDLAudioOutput inputPointer sampleCount
149156 closeSDLAudio capture
150328 floatingPointRemainder left right
`);
specs.sp_server.bridges = bridge(`
22600 startServerThinkTimer intervalMilliseconds
22639 webSocketPopEvent socketId dataPointerPointer byteLengthPointer
22791 supportsPerformanceNow
22855 getTimestamp usePerformanceNow
22903 floatingPointRemainder left right
`);
Object.assign(specs.client.properties, pairs(`Ik=MAX_OPEN_FDS Rl=nextfd Xk=createStream Rk=closeStream Qk=chrdev_stream_ops Qi=FSStream mj=major kn=minor wh=makedev rl=getDevice Zj=getMounts yk=syncfs Hn=unmount Lg=mkdir ln=mkdirTree Fi=mkdev gn=lstat oi=chmod cn=lchmod Tm=fchmod Ij=chown dn=lchown Um=fchown Wm=ftruncate In=utime Uh=isClosed qn=munmap kj=ioctl yn=readFile On=writeFile Am=chdir Tk=createDefaultDirectories Sk=createDefaultDevices Vk=createSpecialDirectories Wk=createStandardStreams Qj=ensureErrnoError lm=staticInit xn=quit dj=getMode Vm=findObject Si=analyzePath Em=createPath Uk=createFile Kj=createDataFile kh=createDevice Uj=forceLoadFile Dm=createLazyFile Fm=createPreloadedFile Dj=DB_NAME Ej=DB_VERSION Oh=DB_STORE_NAME Cn=saveFilesToDB en=loadFilesFromDB un=opts Ok=canOwn $i=exists Ul=parentExists Wl=parentPath Vl=parentObject hm=setErrno
  xg=audioContext gi=timer Ei=streamSource Jg=scriptProcessor Vi=inputBuffer Ii=silenceBuffer Lj=outputBuffer Wg=ctx Zk=previousCanvas yl=height Al=previousContext Hm=previousImageData bl=imageData32 cl=imageData8`));
Object.assign(commonFunctionLocals, { mkdir:['filename','mode'], mkdirTree:['filename','mode'], mkdev:['filename','mode','device'], lstat:['filename'], chmod:['filename','mode','dontFollow'], lchmod:['filename','mode'], fchmod:['fd','mode'], chown:['filename','uid','gid','dontFollow'], lchown:['filename','uid','gid'], fchown:['fd','uid','gid'], ftruncate:['fd','length'], utime:['filename','atime','mtime'], isClosed:['stream'], ioctl:['stream','operation','argument'], readFile:['filename','options'], writeFile:['filename','data','options'], chdir:['filename'], nextfd:['start','end'], createStream:['stream','start','end'], closeStream:['fd'], major:['device'], minor:['device'], makedev:['major','minor'], getDevice:['device'], getMounts:['mount'], syncfs:['populate','callback'], unmount:['mountpoint'], getMode:['canRead','canWrite'], findObject:['filename','dontResolveLastLink'], analyzePath:['filename','dontResolveLastLink'], createPath:['parent','path','canRead','canWrite'], createFile:['parent','name','properties','canRead','canWrite'], createDataFile:['parent','name','data','canRead','canWrite','canOwn'], createDevice:['parent','name','input','output'], forceLoadFile:['node'], createLazyFile:['parent','name','url','canRead','canWrite'], createPreloadedFile:['parent','name','url','canRead','canWrite','onload','onerror','dontCreateFile','canOwn','preFinish'], saveFilesToDB:['paths','onload','onerror'], loadFilesFromDB:['paths','onload','onerror'] });
// Locals whose meaning follows directly from these algorithm implementations.
specs.client.locals = {
 allocateUTF8String:pairs('b=capacity c=pointer'), copyTextToClipboard:pairs('b=previousFocus c=textarea d=copied e=copyError'),
 UTF8ArrayToString:pairs('d=endIndexOrResult e=codePoint g=continuationByte1 h=continuationByte2'), stringToUTF8Array:pairs('e=startIndex g=characterIndex h=codePoint p=lowSurrogate'), lengthBytesUTF8:pairs('b=byteLength c=characterIndex d=codePoint'), allocateUTF8:pairs('b=byteLength c=pointer'),
 getBinary:pairs('b=error'), getBinaryPromise:pairs('a=response'), callRuntimeCallbacks:pairs('b=callback c=functionPointer'), getRandomDevice:pairs('a=randomByte'),
 setMainLoop:pairs('g=isCurrentLoop h=loopGeneration'), emscripten_set_main_loop_timing:pairs('c=immediateCallbacks'),
 emscripten_asm_const_int:pairs('d=isDouble'), getCanvasElementSize:pairs('b=savedStack c=sizePointer d=heightPointer e=idPointer'), getEnvStrings:pairs('a=environment b=key c=strings'), getentropy:pairs('c=index'), arraySum:pairs('c=sum d=index'), addDays:pairs('c=daysInMonth d=month'),
 stringToNewUTF8:pairs('b=byteLength c=pointer'), glGenObjects:pairs('e=index g=object h=handle'),
 webglPrepareUniformLocationsBeforeFirstUse:pairs('b=uniformLocations c=uniformSizes d=uniformIndex e=uniformInfo g=uniformName h=arraySuffixOffset p=locationId'),
 fillMouseEventData:pairs('a=eventPointer b=event c=target'), intArrayFromString:pairs('d=index e=codePoint'),
 strftime:pairs('e=padLeft g=padZero h=compareDates p=getFirstWeekStart q=getWeekYear v=timezonePointer u=formatExpansions z=weekdays B=months t=specifier'),
};
specs.sp_server.locals = {
 allocateUTF8String:pairs('b=capacity c=pointer'), UTF8ArrayToString:pairs('f=endIndexOrResult h=codePoint k=continuationByte1 l=continuationByte2'), stringToUTF8Array:pairs('h=startIndex k=characterIndex l=codePoint p=lowSurrogate'),
 callRuntimeCallbacks:pairs('b=callback c=functionPointer'), getRandomDevice:pairs('a=randomByte'), emscripten_asm_const_int:pairs('f=isDouble'), setMainLoop:pairs('k=isCurrentLoop l=loopGeneration'), emscripten_set_main_loop_timing:pairs('c=immediateCallbacks'), getEnvStrings:pairs('a=environment b=key c=strings'), getentropy:pairs('c=index'), arraySum:pairs('c=sum f=index'), addDays:pairs('c=daysInMonth f=month'),
 strftime:pairs('h=padLeft k=padZero l=compareDates p=getFirstWeekStart m=getWeekYear q=timezonePointer u=specifier v=weekdays A=months'),
};
