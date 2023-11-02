process.title='Messenger'

var url_db='mongodb://127.0.0.1:27017/messenger';
var websocketPort=3001
var websocketServer=require('websocket').server

function htmlEntities(str) {
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var colors = [ 'red', 'green', 'blue', 'magenta', 'purple', 'plum', 'orange' ];
colors.sort(function(a,b) { return Math.random() > 0.5; } );

var MongoClient=require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var connect = require('connect');
var expressSession = require('express-session')
var cookieParser = require('cookie-parser')
var MongoStore=require('connect-mongo')(expressSession)
var http=require('http');
var https=require('https');
var fs=require('fs');
var path=require('path');
var url=require('url');
var requestIp=require('request-ip')
var querystring=require('querystring')
var bcrypt=require('bcrypt')
var app=connect();
const cookie_life=1 * 1 * 1 * 60 * 1000;

app.use(requestIp.mw({ attributeName : 'clientIP' }))
app.use(cookieParser())// Which can make request.cookies return cookie from client request, and return a Object.
var sessionParser=expressSession({
	secret: 'node messenger',
	httpOnly: true, 
    secure: true,
	resave: false, 
	saveUninitialized: true,
	store:new MongoStore({
		url:url_db,
		// ttl: 1 * 1 * 2 * 60 * 1000
	}),
	cookie:{
		sameSite: 'strict',
	// 	secure: true,
	// 	path:'/',
		maxAge: cookie_life //cookie in browser connect.sid expired time, is the session created by express session expired time either.
	}
})
app.use(sessionParser)

var server=https.createServer(
	{
		key: fs.readFileSync('./certification/localhost-key.pem'),
		cert: fs.readFileSync('./certification/localhost-crt.pem'),
		passphrase: "****1_______",
	},
	app.use(		
		async function(request,response){

			// Set CORS headers
			response.setHeader('Access-Control-Allow-Origin', 'https://192.168.31.27:8081');
			response.setHeader('Access-Control-Request-Method', '*');
			response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
			response.setHeader('Access-Control-Allow-Headers', "Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
			response.setHeader('Access-Control-Allow-Credentials', true);

			var ip = request.clientIP;
			var session=request.session;
			var _data='';

			request.on('data', function(data){//for next(), if no data listenser, will stuck the client request.
				
				_data+=data;
				if (request.method!=='OPTIONS') {
					// console.log('request body', _data)
				}
			});

			switch (url.parse(request.url).pathname) {
				case '/test-session':
					if (request.method==='OPTIONS'){
            			request.on('end', function(){
		            		response.end('{"pre-light":"ok"}');
		            	})
            		}
            		if (request.method==='POST'){
            			request.on('end', function(){
		            		response.end(JSON.stringify({
		            			username: response.req.session || 'not found session',
		            		}));
		            	})
					}
					break;
				case '/postlogin':
					if (request.method==='OPTIONS'){
            			request.on('end', function(){
		            		response.end('{"pre-light":"ok"}');
		            	})
            		}
            		if (request.method==='POST'){
            			console.log('sessionID',response.req.sessionID)
            			request.on('end',function(){
							
							if (validationData(_data)) {
								insertOneToDB(_data,async function(result,options){
									console.log('insertOneToDB begin')
									if (!result) {
										response.end(JSON.stringify({
											msg:'wrong password'
										}));//wrong password
									}
									else {
										switch(options.type) {
											case 'register':
												response.req.session.authenticated = true
												response.req.session.user=result.name;//IMPORTANT... save the user id to session where store in DB
												response.end(JSON.stringify(response.req.session))
												break;
											case 'login':
												// console.log(result)
												response.req.session.authenticated = true
												response.req.session.user = {
													name:result.name,
													pass:result.password
												}
												console.log('cookie', response.req.session.cookie)
												response.writeHead(200, {
													'Content-Type': 'application/json',
													'Set-Cookie':[
														'name='+result.name+'; SameSite=Strict; expires='+response.req.session.cookie._expires.toUTCString(),
														'expire='+new Date(response.req.session.cookie._expires).getTime()+'; SameSite=Strict; expires='+response.req.session.cookie._expires.toUTCString(),
													]
												});
												// request.cookies.log_info={
												// 	authenticated:true,
												// 	user:{
												// 		name:result.name,
												// 	}
												// }
												// response.req.session.cookie.user = result.name
											    // try {
											    //     await response.req.session.save();
											    // } catch (err) {
											    //     console.error('Error saving to session storage: ', err);
											    //     return next(new Error('Error creating user'));
											    // }
												//getSessionFromDB(request.sessionID,function(data){
													//if (data) {
														response.end(JSON.stringify(response.req.session))
													//}else {
													//	response.end();
														//get invalid or expired
													//}	
												//})										
												break;
											case 'failed':
												response.end(
													JSON.stringify({
														msg:result
													})
												)
												break;
											default: 
												response.end(
													JSON.stringify({
														msg:'unkown error'
													})
												)										
												break;	
										}									
									}
								})
							}else {
								response.end(
									JSON.stringify({
										msg:'POST wrong data.'
									})
								)
								return false;
							}
						})
            		}
					
					
					break;
				case '/getlogout':	
					if (request.method==='OPTIONS'){
            			request.on('end', function(){
		            		response.end('{"pre-light":"ok"}');
		            	})
            		}
            		if (request.method==='POST'){	
            			request.on('end', function(){
		            		let body=JSON.parse(_data);
						
							response.req.session.cookie.maxAge = 3000;
							response.req.session.save(function(err) {
							})
							response.req.session.reload(function(err) {
							})
							response.req.session.touch();
							var sid_name=body.sid_name
							console.log('Websocket owner: ',sid_name,' BEFORE CLOSE, now clients length: ',clients.length)
							clients.filter(function(client){
								return client.userName===sid_name
							}).forEach(function(_client){
								websocket_close_flag=true;
								_client.connection.close()
							})

							clients=clients.filter(function(client){
								return client.userName!==sid_name
							})

							response.writeHead(200, {
								'Content-Type':'text/html',
								'Set-Cookie':[
									'name='+'null'+'; SameSite=Strict; expires='+new Date(new Date().getTime()).toUTCString(),
									'connect.sid='+'null'+'; SameSite=Strict; expires='+new Date(new Date().getTime()).toUTCString()
								]
							});

							response.end('logout success');
		            	})

					}
					break;
				case '/postrefresh':
					var _data='';
					request.on('data',function(data){
						_data+=data;
					})
					request.on('end',function(){
						response.writeHead(200, {'Content-Type': 'application/json'});
						//var _result=querystring.parse(_data)
						//var result=JSON.stringify(_result)
						validateSessionFromDB(request.sessionID,decodeURIComponent(request.headers.cookie.split('=')[1].split(';')[0]),function(result){
							// console.log(result)
							if (!result) {
								response.end('');
							}else {

								response.end('refresh on valid');
							}
						})
					})
					break;
				case '/postchangeroom':
					var _data='';
					request.on('data',function(data){
						_data+=data;
					})
					request.on('end',function(){
						response.writeHead(200, {'Content-Type': 'application/json'});
						var _result=querystring.parse(_data)
						//var result=JSON.stringify(_result)
						validateSessionFromDB(request.sessionID,decodeURIComponent(request.headers.cookie.split('=')[1].split(';')[0]),function(result){
							// console.log(result)
							if (!result) {
								response.end('');
							}else {
								changeCollectionFromDB({
									type:_result.type,
									name:{
										host:_result.hostname,
										guest:_result.guestname	
									}
								},function(_databaseCollection,status){
									if (status==='export') {
										var _connection=clients.filter(function(data){
											return data.userName===_result.hostname
										});
										if (_connection.length>0){										
											_connection.forEach(function(_this){
												exportDialogueFromDB(function(result){
													console.log('sendUTF from changeCollectionFromDB status===\'export\'')
													if (result.length>0) {
														_this.connection.sendUTF(JSON.stringify({
															origin:_result.guestname,
															type:'history',
															data:result
														}))
													}
												},{
													databaseCollection:_databaseCollection
												})
											})
										}
									}
									var _connection=clients.filter(function(data){
										return data.userName===_result.hostname||data.userName===_result.guestname
									});
									if (_connection.length>0 && status!=='export'){										
										_connection.forEach(function(_this){
											exportDialogueFromDB(function(result){
												console.log('sendUTF from changeCollectionFromDB')
												if (result.length>0) {
													_this.connection.sendUTF(JSON.stringify({
														type:'history',
														data:result
													}))
												}
											},{
												databaseCollection:_databaseCollection
											})
										})
									}
									clients.filter(function(data){
										return data.userName===_result.hostname
									})[0].databaseCollection=_databaseCollection
									clients.filter(function(data){
										return data.userName===_result.hostname
									})[0].targetName=_result.guestname
								});
								response.end('database changed to private collection.');
							}
						})
					})
					break;	
				default:
					console.log('request.cookie',request.cookies.name)
					var fileName=path.basename(request.url) || 'index.html';
					fileName=path.basename(request.url).indexOf('?')==0
						?'index.html'
						:path.basename(request.url)==''
							?'index.html'
							:path.basename(request.url);
					var fullPath=__dirname+'/src/'+fileName;
					console.log('Request for '+fullPath+' received.\r\n------Client ip is '+ip);

					fs.readFile(fullPath,function(error,fileBinary){
						if (error){
							console.log(error);
							response.writeHead(200,{
								'Content-Type':'text/html'
							});
							response.write('no such file');
						}else {
							response.writeHead(200,{
								'Content-Type':'text/html'
							});
							response.write(fileBinary.toString());
						}
						response.end();
					});
					break;
			}
		}
	)
)

server.listen(websocketPort,function(){
	console.log("Server is listening on port "+websocketPort )
})

var ws=new websocketServer({
	httpServer:server,
	// autoAcceptConnections: false
})
var history=[];
var clients=[];
var db_collection_pointer='dialogues';
var websocket_close_flag=false;

function originIsAllowed(url){
	let result=false;
	switch (url){
		case 'https://192.168.31.27:8081':
			result=true;
			break;
		default:
			break;	
	}
	return result;
}

function notConnected(name){
	let result;
	result=clients.filter(item=>{
		return item.userName===name
	})
	if (result.length) {
		return false;
	}else {
		return true;
	}
}

ws.on('request',function(request){
	if (!request.resourceURL.query.user || (!originIsAllowed(request.origin) && notConnected(request.resourceURL.query.user))) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }
	// console.log(request.resourceURL.query.user)
	console.log('request.key',request.key)
	// console.log(request.cookies)

	var connection=request.accept(null,request.origin)
	// console.log('connection',(connection))
	connection.key=request.key;
	console.log("Websocket connection from "+request.origin+' accepted.');
	var userName=false;
	var userColor=false;
	let client={
		connection:connection,
		remoteAddress:request.origin,
		key:request.key,
		// databaseCollection:db_collection_pointer,
		userName:request.resourceURL.query.user,
		userColor:userColor,
		targetName:null,
		ping_time:0,
		pong_time:0,
		ping_timer:null
	};
	connection.client=client;
	var index=clients.push(client)-1
	// console.log('clients index: ',index)

	ping(client);

	function ping(client) {
		console.log('client', client.key, client.ping_time)
		if (typeof client.ping_time === 'undefined' || client.ping_time>client.pong_time+1) {
  			console.log(client.userName,' WS connect seem lose. Ready for splice websocket client')

  			console.log('Websocket owner: ',client.userName,' BEFORE CLOSE, now clients length: ',clients.length)
			console.log('clients[index].key',client.key)
			client.connection.close();
			
			// clients.forEach((item,index)=>{
			// 	if (item.key===client.key) {
			// 		clients.splice(index, 1);
			// 	}
			// })
			
  		}else {
		    connection.sendUTF(JSON.stringify({
				origin: 'Server',
				type:'ping/pong',
				data: 'ping'
			}))
			client.ping_time++;
			client.ping_timer=setTimeout(function(){
		  		ping(client);
			},5000)
		}
  	}
// var ping_timer=null;
// var ping_time=0;
// var pong_time=0;
  	
  	// ping_timer=setTimeout(function(){  		
  		
	// },5000)
  	

	connection.on('message',function(message){
		// console.log('message',message)
		if (message.utf8Data==='pong') {
			// console.log('client ws alive.')			
	  		connection.client.pong_time++;
		}
		else if (message.type==='utf8') {
			if (message.utf8Data==='Instruction/List/public') {
				exportDialogueFromDB(
					function(result,targetName){
						console.log('sendUTF from inquirePrivateDialoguesFromDB')
						if (result.length>0) {
							connection.sendUTF(JSON.stringify({
								origin:targetName,
								type:'history',
								data:result
							}))
						}
					},{
						databaseCollection:'public'
					}
				)
			}
			else if (clients[index].userName===false) {
				userName=htmlEntities(message.utf8Data);
				//userColor=colors.shift()
// 				sessionParser(
// 					request.httpRequest, 
// 					{}, 
// 					function(){
// 						console.log('request',request)
// 						request.httpRequest.session.username=userName
// 						//console.log(request.httpRequest.session.usercolor)
// 						userColor=request.httpRequest.session.usercolor===undefined
// 					        	?colors.shift()
// 					        	:request.httpRequest.session.usercolor				        
// 						request.httpRequest.session.usercolor=userColor
// 						// console.log(request.cookies)
// 						request.httpRequest.session.cid=request.cookies[0].value
// 						// console.log(request.httpRequest.session.cid)
// 				        request.httpRequest.session.save(function(error){
// 				        	if (error) {
// 				        		console.log("SESSION SAVE ERROR:",error)
// 				        	}
// 
// 				        	connection.sendUTF(JSON.stringify({
// 								type:'color',
// 								data:userColor
// 							}))
// 				        })
// 			    	}
// 		    	);
			    // console.log(userColor)
				
				// clients[index].userName=userName
				// clients[index].userColor=userColor
				//console.log(clients[index].userName)
				
				inquirePrivateDialoguesFromDB(userName,function(inquireResult){	
					// inquireResult.forEach(function(result){
					// 	result.forEach(function(entry){
					// 		clients[index].databaseCollection.private.push({
					// 			collectionName:inquireResult.collectionName,
					// 			targetName:inquireResult.targetName
					// 		});
					// 	})
					// })
					exportDialogueFromDB(function(result,targetName){
						console.log('sendUTF from inquirePrivateDialoguesFromDB')
						if (result.length>0) {
							connection.sendUTF(JSON.stringify({
								origin:targetName,
								type:'history',
								data:result
							}))
						}
					},{
						databaseCollection:inquireResult.collectionName,
						targetName:inquireResult.targetName
					})
				});
			}
			else {
				console.log((new Date()) + ' Received Message from ' + clients[index].userName + ': ' + message.utf8Data);
				var obj={
					time:(new Date()).getTime(),
					author:clients[index].userName,
					text:htmlEntities(message.utf8Data),					
					color:userColor
				}
				insertDialogueToDB(obj,{
					databaseCollection:clients[index].databaseCollection
				});
				history=history.slice(-100)

				if (clients[index].databaseCollection===db_collection_pointer) {
					var json=JSON.stringify({
						origin:'public',
						type:'message', 
						data: obj 
					});	
					// console.log('clients length: ',clients.length)
					for (var i=0;i<clients.length;i++){
						clients[i].connection.sendUTF(json)//boradcast message to all connections
					}
				}else {
					//console.log(connection.targetName)
					if (connection.targetName===null) {
						console.log('targetName is null on message')
					}else {
						clients[index].connection.sendUTF(
							JSON.stringify({
								origin:clients[index].targetName,
								type:'message', 
								data: obj 
							})
						);
						if (clients.filter(function(data){
							return data.userName===clients[index].targetName
						}).length>0) {
							clients.filter(function(data){
								return data.userName===clients[index].targetName
							})[0].connection.sendUTF(
								JSON.stringify({
									origin:userName,
									type:'message', 
									data: obj 
								})
							);
						}
					}
				}
			}
		}		
	})

	connection.on('close', function(reasonCode, description) {
		console.log('ready for close ws.', description )
// 		console.log('someone close client',userName,userColor)
// 		if (userName !== false && userColor !== false) {
// 			if (websocket_close_flag===false) {
// 				console.log('Ready for splice websocket client')
// 				clients.splice(index, 1);
// 			}
 			
// 			// console.log('client index: ',index)
// 			// console.log('client: ',clients[index])
// 			
// 			// remove user from the list of connected clients
		clients.forEach((item,index)=>{
			if (item.key===connection.key) {
				clients.splice(index, 1);
			}
		})
		
// 			// push back user's color to be reused by another user
// 			colors.push(userColor);
// 
// 			websocket_close_flag=false;
// 		}
		console.log('CLOSED, now clients length: ',clients.length)
	});

	connection.on('connect', function(connection){
		
	})
})

function getCollectionName(entry){
	return entry.s.namespace.collection
}

function inquirePrivateDialoguesFromDB(userName,callback){
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')

		

		findOneFromDB(userName,function(uid){
			messengerDB.collections(function(error,result){
				var hasprivate=false;
				result.forEach(function(entry){
					if (getCollectionName(entry).indexOf(uid)>-1) {
						// messengerDB.collection(entry.s.namespace.collection).find().forEach(item=>{
							// console.log(item)
							// if (item.name.indexOf(uid)>-1){
								hasprivate=true;
							// }	
						// })	
					}					
				})

				if (hasprivate===true) {
					result.forEach(function(entry){
						if (getCollectionName(entry).indexOf(uid)>-1) {
							var target_uid='';
							if ( getCollectionName(entry).indexOf('_host_'+uid)>-1 ){
								target_uid=getCollectionName(entry).split('_host_'+uid)[1].split('_guest_')[1]
							}else if ( getCollectionName(entry).indexOf('_guest_'+uid)>-1 ) {
								target_uid=getCollectionName(entry).split('_guest_'+uid)[0].split('dialogues_host_')[1]
							}
							findUidFromDB(target_uid,function(targetName){
								callback({
									collectionName:getCollectionName(entry),
									targetName:targetName
								})							
							})						
						}
					});
					mongo.close();
				}else {
					callback({
						collectionName:db_collection_pointer,
						targetName:'public'
					})
					mongo.close();
				}				
			})
		})
		
	})
}

function findOneFromDB(userName,callback){
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')

		messengerDB.collection('conversations').findOne(
			{
				name:userName
			},
			function(error,result){
				if (!result) {
					console.log('find sid failed.')
					mongo.close();
				}else {
					callback(result._id)
					mongo.close();
				}				
			}
		)
	})
}

function findUidFromDB(uid,callback){
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		
		messengerDB.collection('conversations').findOne(
			{
				_id:new ObjectID(uid)
			},
			function(error,result){
				if (!result) {
					console.log('find username failed.')
					mongo.close();
				}else {
					callback(result.name)
					mongo.close();
				}				
			}
		)
	})
}

function insertOneToDB(entry,callback){
	let _entry=JSON.parse(entry);
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw('step1:'+error)
		}
		var messengerDB=mongo.db('messenger')

		//excute already login		
		var _connection=clients.filter(function(data){
			return data.userName==_entry.name
		});
		// console.log('Already login: ',_connection.length)
		if (_connection.length>0) {
			mongo.close();
			return callback('WS already login.',{type:'failed'})
		}

		messengerDB.collection('conversations').findOne(
			{
				name:_entry.name
			},
			function(error,result){
				console.log('result',result)
				if (!result) {
					registerFunc(
						mongo,
						messengerDB,
						entry,
						callback
					)
				}else {
					bcrypt.compare(_entry.password,result.password,function(error,_result){
						console.log('_result',_result)
						if (_result==true){
							console.log('Welcome '+_entry.name)
							mongo.close();
							callback(result,{type:'login'})
						}else {
							console.log('Password invalid.')
							mongo.close();
							callback('Password invalid.',{type:'failed'})
						}						
					})
				}				
			}
		)
	})
}

function registerFunc(database,collection,entry,callback){
	let _entry=JSON.parse(entry);
	var mongo=database
	var messengerDB=collection
	bcrypt.hash(_entry.password,10,function(error,hash){
		if(error){
			throw('bcrypt error: '+error)
		}
		_entry.password=hash;
		messengerDB.collection('conversations').insertOne(_entry,function(error,result){
			if(error) {
				throw('step3:'+error)
			}			
			console.log(_entry.name+' registered, welcome!')
			_entry.id=result.insertedId;
			mongo.close();

			callback(
				_entry,
				{type:'register'}
			)
		})
	})
}

function insertDialogueToDB(entry,options){
	var _db_collection_pointer=db_collection_pointer;
	if (options!==undefined) {
		if (options.databaseCollection!==undefined) {
			_db_collection_pointer=options.databaseCollection
		}
	}	
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')	
		
		messengerDB.collection(_db_collection_pointer).insertOne(entry,function(error,result){
			if(error) {
				throw(error)
			}
			console.log('Inserted one dialogue.')
			mongo.close();
		})			
	})
}

function changeCollectionFromDB(options,callback){
	// console.log(options)
	if (options.type==='public') {
		callback(db_collection_pointer);
	}else {
		MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
			if (error) {
				throw(error)
			}
			var messengerDB=mongo.db('messenger')
			
			messengerDB.collection('conversations').find(
				{ 
					name:{ 
						$in:[ options.name.host, options.name.guest ] 
					} 
				}
			).toArray(function(error,result){
				if (error) {
					throw(error)
				}
				if (!result) {
					console.log('conversation participants not match.')
					mongo.close();
				}else {
					var _databaseCollection='';

					var collection_exist=[];
					messengerDB.collections(function(error,collectionresult){
						collection_exist=collectionresult.filter(function(entry){
							if (entry.s.namespace.collection.indexOf(result[0]._id)>-1 && entry.s.namespace.collection.indexOf(result[1]._id)>-1) {
								return entry
							}
						})
						if (collection_exist.length>0){
							console.log(collection_exist[0].s.namespace.collection)
							callback(collection_exist[0].s.namespace.collection,'export');
						}else {
							if (result[0].name===options.name.host) {
								_databaseCollection='dialogues_host_'+result[0]._id+'_guest_'+result[1]._id	
							}else {
								_databaseCollection='dialogues_host_'+result[1]._id+'_guest_'+result[0]._id
							}
							console.log('result is: ',result)
							console.log('Private room is: ',_databaseCollection)
							callback(_databaseCollection,'create');
						}
						mongo.close();
					})
				}				
			})
		})
	}
}

function exportDialogueFromDB(next,options){
	var _db_collection_pointer=db_collection_pointer;
	if (options!==undefined) {
		if (options.databaseCollection!==undefined) {
			_db_collection_pointer=options.databaseCollection
		}
	}	
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		if (options.databaseCollection==='public') {
			messengerDB.collection(db_collection_pointer).find({}).sort({"time":1}).toArray(function(error,result){
				if(error) {
					throw(error)
				}
				next(result,'public')
				mongo.close();
			})
		}else {
			messengerDB.collection(_db_collection_pointer).find({}).sort({"time":1}).toArray(function(error,result){
				if(error) {
					throw(error)
				}
				next(result,options.targetName)
				mongo.close();
			})	
		}
		
			
								
	})
}

function validateSessionFromDB(sid,cid,callback){
	// console.log(sid,cid)
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		var _sid={
			_id:sid
		}
		// console.log('_sid: ',_sid)
		// console.log('cid: ',cid)
		var datas=messengerDB.collection('sessions').findOne(_sid,function(error,result){
			if (error) {
				throw(error)
			}
			// console.log('entry in db by sid: ',result)
			if (!result) {
				//sid invalid or expired
				console.log('not found sid')
				callback()
			}else {
				if (JSON.parse(result.session).cid!==cid) {
					console.log('sid invalid')
					callback();
				}else {
					console.log('sid valid')
					callback('valid')
				}				
			}
			mongo.close();
		});
	})
}

function removeSessionFromDB(sid){
	MongoClient.connect(url_db,{ useNewUrlParser: true, useUnifiedTopology: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		
		var datas=messengerDB.collection('sessions').find({}).forEach(function(data){
				// console.log(data)
				if (data.session.indexOf(sid)>-1) {
					var _id=data._id
					//console.log(_id)
					messengerDB.collection('sessions').deleteOne({_id:_id},function(error,object){
						if (error) {
							throw(error)
						}
						console.log("session deleted");
						mongo.close();
					})
					
				}else {
					mongo.close();
				}
			
		});
		//mongo.close();
	})
}

function validationData(data) {
	if (data.name==='') {
		return false;
	}else {
		return true
	}
}