(function(){
    var open=false;
    window.openImageViewer=function(url){
        if(!url) return;
        document.getElementById('imgViewerImg').src=url;
        document.getElementById('imgViewerOverlay').classList.remove('hidden');
        if(!open){ open=true; try{ history.pushState({imgViewer:1},''); }catch(e){} }
    };
    function hide(){
        document.getElementById('imgViewerOverlay').classList.add('hidden');
        document.getElementById('imgViewerImg').src='';
        open=false;
    }
    window.closeImageViewer=function(){
        if(open){ open=false; try{ history.back(); return; }catch(e){} }
        hide();
    };
    window.addEventListener('popstate',function(){ if(!document.getElementById('imgViewerOverlay').classList.contains('hidden')) hide(); });
})();
