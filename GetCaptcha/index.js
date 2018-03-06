gm = require('gm').subClass({appPath: __dirname + "/gm/"});
var azure = require('azure-storage');
var qs = require('querystring');
var sgMail = require('@sendgrid/mail');


function ordinal_suffix_of(i) {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = function (context, req) {


    var genDigits =  6
    if (process.env['APPSETTING_genDigits']){
        genDigits = parseInt(process.env['APPSETTING_genDigits'])
    }
    
    var selectDigits = 3
    if (process.env['APPSETTING_selectDigits']){
        selectDigits = parseInt(process.env['APPSETTING_selectDigits'])
    }
    
    var sendResponse  = function(resObj){

        context.log(JSON.stringify(req.headers, null, 2))

        if (req.headers && req.headers["origin"]){
            resObj.headers["Access-Control-Allow-Credentials"] = "true"
            resObj.headers["Access-Control-Allow-Origin"] = req.headers["origin"]
            resObj.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"  
            context.log(JSON.stringify(resObj, null, 2))
        }

        
        
        context.res = resObj
        context.done()
    }


    var tableSvc = azure.createTableService(process.env['APPSETTING_AzureWebJobsStorage']);
    
    tableSvc.createTableIfNotExists('captchas', function(error, result, response){
    
        //context.log(JSON.stringify(req.body))
    
        if(!error){
            
            var kvp = {}
            
            if (req.method == 'POST'){
                kvp = qs.parse(req.body)
            }   
            
            if (req.method == 'GET'){
                 for (var k in req.query) {
                     kvp[k] = req.query[k]
                 }
            }
            
            if (kvp.captcha){
                
                var notifyEmail = process.env['APPSETTING_notifyEmail'] || ""                
                
                var attempt = "";
                var redirectSuccessURL, redirectFailURL, captchaSet

                attempt =  kvp.captcha
                redirectSuccessURL = kvp.captchaSuccessURL || ""
                redirectFailURL = kvp.captchaFailURL || ""
                captchaSet = kvp.captchaSet || "forms"                
                
                if (req.headers['cookie']){
                    var cuuid = req.headers['cookie'].split("=")[1]
                    tableSvc.retrieveEntity('captchas', 'captchas', cuuid, function(error, existingCaptcha, response){
                        if(!error){
                            

                            var solved= (existingCaptcha.solution['_'] == attempt && existingCaptcha.state['_'] == "unsolved")
                            
                            existingCaptcha.state = {'_':  "failed"}
                            if(solved){
                                existingCaptcha.state = {'_':  "solved"}    
                            }
                                
                            tableSvc.mergeEntity ('captchas', existingCaptcha, function(error, result, response){
                                if(!error) {
        							if (solved){
        							
        								var form = {
        									PartitionKey: {'_':'form'},
        									RowKey: {'_': cuuid}
        								};                             
        								
        								var sysKeys = ["captchaSuccessURL", "captchaFailURL", "captchaSet", "captcha"]
        								
        								for (var k in kvp) {
        									if (sysKeys.indexOf(k) < 0){
        										form[k] =  {'_': kvp[k]}
        									}
        								}
        								
        								tableSvc.createTableIfNotExists(captchaSet, function(error, result, response){
        									tableSvc.insertEntity(captchaSet, form, function (error, result, response) {
        										
        										try{
        
        											if (process.env["APPSETTING_sendgridAPIKey"] 
        											&& process.env['APPSETTING_notifyEmail']){
        
        											sgMail.setApiKey(process.env["APPSETTING_sendgridAPIKey"]);
        											sgMail.send({
        												to: process.env['APPSETTING_notifyEmail'],
        												from: process.env['APPSETTING_notifyEmail'],
        												subject: 'Form Submission from CAPTCHA form ' + captchaSet,
        												text: JSON.stringify(kvp, null, 2)
        											});
        										}                                       
        
        										}catch(e){
        										   context.log(e.toString())
        										}
        
        										if (kvp.captchaSuccessURL){
        											sendResponse({
        												status: 302, 
        												body: solved,
        												headers: {
        													'Location': kvp.captchaSuccessURL,
        												}
        											})
        										}else{
        											sendResponse({
        												status: 200, 
        												body: solved,
        												isRaw: true,
                                                        headers: {
                                                            'Content-Type': 'text/plain'
                                                        }
        											})                                          
        										}
        	  
                                       
        									})                                
        								})							
        							
        							}else{
        							
        								if (kvp.captchaFailURL){
        									sendResponse({
        										status: 302, 
        										body: solved,
        										headers: {
        											'Location': kvp.captchaFailURL,
        										}
        									})
        								}else{
        									sendResponse({
        										status: 200, 
        										body: solved,
        										isRaw: true,
                                                headers: {
                                                     'Content-Type': 'text/plain'
                                                }							
        									})                                          
        								}
        
        							
        							}
                                }else{
									sendResponse({
										status: 404, 
										body: "Not Found",
									})                                        
                                
                                }
                            });
                        }else{
                            sendResponse({
                                status: 404, 
                                body: "Not Found.",
                            })
                                                        
                        }
                    });
                }else{
                    sendResponse({
                        status: 404, 
                        body: "Not Found.",
                    })
                    
                }
            }else{
                            
                var randomStr = ""
                var digits = []
                var selectedDigits = []
                var solution = ""
            
            
                for(i = 0; i < genDigits; i++){
                    var digit = Math.floor(Math.random() * 10)
                    digits.push(digit)
                }
            
                selectedCount = 0;
                while (selectedCount < selectDigits){
                    var selected = Math.floor(Math.random() * genDigits)
                    if (selectedDigits.indexOf(selected) < 0){
                        selectedDigits.push(selected)
                        solution += digits[selected]
                        selectedCount++
                    }
                }                
                
                var cuuid = uuidv4()
                
                var captcha = {
                    PartitionKey: {'_':'captchas'},
                    RowKey: {'_': cuuid},
                    digits: {'_': digits.join(',')},
                    selected: {'_':  selectedDigits.join(',')},
                    solution: {'_':  solution},
                    state: {'_':  "unsolved"}
                };        
                
                
                tableSvc.insertEntity('captchas',captcha, function (error, result, response) {
                    if(!error){
                        
                        var selectStr = "Type in the "
                    
                        for(var i = 0; i < selectedDigits.length; i++){
                            if(i > 0 && i <= selectedDigits.length - 1){
                                selectStr += ', '	
                            }
                            if (i == selectedDigits.length - 1){
                                selectStr += ' then '
                            }
                            selectStr += ordinal_suffix_of(selectedDigits[i] + 1)
                        }
                    
                        selectStr += ' digits.'
                    
                        gm(350, 50, "#ffffff")
                        .font("Tahoma")
                        .fontSize(20)
                        .drawText(10, 20, digits.join('  '))
                        .fontSize(16)
                        .drawText(10, 40, selectStr)
                        .toBuffer('PNG',function (err, buffer) {
                            if (err) {
                                 sendResponse(context.res = {
                                     status: 404, 
                                     body: "Not Found."
                                 })            
                            }else{
                                 sendResponse({
                                     status: 200, 
                                     body: buffer,
                                     isRaw: true,
                                     headers: {
                                         'Content-Type': 'image/png',
                                         'Set-Cookie': 'cuuid=' + cuuid
                                     }
                                })
                            }

                    
                        })                    
                    }
                });                  
                
            }
        }
    });
}

