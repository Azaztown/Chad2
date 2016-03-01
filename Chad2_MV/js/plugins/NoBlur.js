//=============================================================================
// Anti_Blur
// by Faytless / Thomas Pham
// Date: 10/25/2015  
 
//=============================================================================
  
 
/*:
 * @plugindesc xxxxx   // Describe your plugin
 * @author yyyy        // your name goes here
 *
 * @param xxxxx      //name of a parameter you want the user to edit
 * @desc yyyyy       //short description of the parameter
 * @default zzzzz    // set default value for the parameter
 
 */
  
  
  // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
  // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
    // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
      // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
        // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
          // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
            // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
              // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
                // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
                  // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. THIS IS A BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
                   
            
            
 // Declare your function
 
  
// 1.  change *** to your plug ins file name below.
// You are telling RPG maker that this plugin exsists.
  (function() {
  var parameters = PluginManager.parameters('template');
   
  // NOTE: THIS WILL NOT MAKE YOU A DARK WIZARD. HERE ARE SOME BASE FOR YOU TO LAY A FOUNDATION FOR PLUGINS!
// Now find something you want to edit in the core plugins.  You can
// find them in the Project\www\js folder 
// 2. find the EXACT function you want to edit
   
   
  /*
  This function can be found in rpg_scenes.js
   
  Scene_Title.prototype.drawGameTitle = function() {
    var x = 20;
    var y = Graphics.height / 4;
    var maxWidth = Graphics.width - x * 2;
    var text = $dataSystem.gameTitle;
    this._gameTitleSprite.bitmap.outlineColor = 'black';
    this._gameTitleSprite.bitmap.outlineWidth = 8;
    this._gameTitleSprite.bitmap.fontSize = 72;
    this._gameTitleSprite.bitmap.drawText(text, x, y, maxWidth, 48, 'center');
     
    */
     
 
     
    // You need to come up with a name for your modification while keeping
    // class name the same.
     
    // the name of the function I want to edit is called 
    //  Scene_Title.prototype.drawGameTitle 
    // The name of my function will be called _Scene_Title_xxx
    //Follow for ease of use,  follow the template below.
    // Start your var as _NAME_NAME_YOURCLASSNAME
    // Have it equal the function you are replacing
     
 
   
  var _Scene_Title_xxx = Scene_Title.prototype.drawGameTitle;
   
   
   
   
  // make your adjustments by adding code, or adjusting them below.
  // This is an exact copy of the code above,  but with some of my adjustments
  // to some of the parameters.  Later,  I will show how you can call your parameters that the user adjusts
  // so your plugin has a little more control 
   
    Scene_Title.prototype.drawGameTitle = function() { 
     
    // _Scene_Title_xxx.call(this);    //sometimes you have to call your function to get this to work.  In this case you don't Ill explain why later.
 
    var x = 20;
    var y = Graphics.height / 4;
    var maxWidth = Graphics.width - x * 2;
    var text = $dataSystem.gameTitle;
    this._gameTitleSprite.bitmap.outlineColor = 'black';
    this._gameTitleSprite.bitmap.outlineWidth = 8;
    this._gameTitleSprite.bitmap.fontSize = 200;
    this._gameTitleSprite.bitmap.drawText(text, 0,0 , maxWidth, 48, 'center');
   
   
   
   
  }
   
   
   
   
   
  })();  // dont touch this.




ImageManager.loadBitmap = function(folder, filename, hue, smooth) {   


	if (filename) {        
			var path = folder + encodeURIComponent(filename) + '.png';
			var bitmap = this.loadNormalBitmap(path, hue || 0);        
			//console.log("disabling smoothing for "+path);		
			bitmap.smooth = false;        
			return bitmap;    
		} 
	else { 
		return this.loadEmptyBitmap();    }};
		