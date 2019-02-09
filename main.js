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
var fs=require('fs');
var path=require('path');
var url=require('url');
var requestIp=require('request-ip')
var querystring=require('querystring')
var bcrypt=require('bcrypt')
var app=connect();

app.use(requestIp.mw({ attributeName : 'clientIP' }))
app.use(cookieParser())
var sessionParser=expressSession({
	secret: 'node messenger',
	resave: false, 
	saveUninitialized: true,
	store:new MongoStore({
		url:url_db
	}),
	cookie:{
		path:'/',
		maxAge: 60000 * 1
	}
})
app.use(sessionParser)

var server=http.createServer(
	
	app.use(

		function(request,response){

			var ip = request.clientIP;
			var session=request.session;

			switch (url.parse(request.url).pathname) {
				case '/postlogin':
					// console.log(Object.keys(request))
					//console.log(decodeURIComponent(request.headers.cookie.split('=')[1]))
					var _data='';
					request.on('data',function(data){
						_data+=data;
					})
					request.on('end',function(){
						response.writeHead(200, {'Content-Type': 'application/json'});
						var _result=querystring.parse(_data)
						var result=JSON.stringify(_result)
						if (validationData(_result)) {
							insertOneToDB(_result,function(result,options){
								if (!result) {
									response.end('');//wrong password
								}else {
									switch(options.type) {
										case 'register':
											response.end('{"name":"'+result.name+'"}')
											break;
										case 'login':
											//getSessionFromDB(request.sessionID,function(data){
												//if (data) {
													response.end(
														'{"name":"'+_result.name+'"}'
													)	
												//}else {
												//	response.end();
													//get invalid or expired
												//}	
											//})										
											break;
										default: 										
											break;	
									}
									
								}
							})
						}else {
							console.log('POST wrong data.')
							return false;
						}
					})
					break;
				case '/getlogout':
					var sid_name=querystring.parse( url.parse(request.url).query ).sid_name
					console.log('BEFORE CLOSE, now clients length: ',clients.length)
					console.log(sid_name)
					clients.filter(function(client){
						return client.userName===sid_name
					}).forEach(function(_client){
						websocket_close_flag=true;
						_client.connection.close()
					})

					clients=clients.filter(function(client){
						return client.userName!==sid_name
					})

					response.writeHead(200,{
						'Content-Type':'text/html'
					});
					response.end('logout success');
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
									// if (status==='export') {
									// 	var _connection=clients.filter(function(data){
									// 		return data.userName===_result.hostname
									// 	});
									// 	if (_connection.length>0){										
									// 		_connection.forEach(function(_this){
									// 			exportDialogueFromDB(function(result){
									// 				if (result.length>0) {
									// 					_this.connection.sendUTF(JSON.stringify({
									// 						origin:_result.guestname,
									// 						type:'history',
									// 						data:result
									// 					}))
									// 				}
									// 			},{
									// 				databaseCollection:_databaseCollection
									// 			})
									// 		})
									// 	}
									// }
									// var _connection=clients.filter(function(data){
									// 	return data.userName===_result.hostname||data.userName===_result.guestname
									// });
									// if (_connection.length>0){										
									// 	_connection.forEach(function(_this){
									// 		exportDialogueFromDB(function(result){
									// 			if (result.length>0) {
									// 				_this.connection.sendUTF(JSON.stringify({
									// 					type:'history',
									// 					data:result
									// 				}))
									// 			}
									// 		},{
									// 			databaseCollection:_databaseCollection
									// 		})
									// 	})
									// }
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
	httpServer:server
})
var history=[];
var clients=[];
var db_collection_pointer='dialogues';
var websocket_close_flag=false;

ws.on('request',function(request){
	var connection=request.accept(null,request.origin)
	console.log("Websocket connection from "+request.origin+' accepted.');
	var userName=false;
	var userColor=false;
	var index=clients.push({
		connection:connection,
		remoteAddress:connection.remoteAddress,
		databaseCollection:db_collection_pointer,
		userName:userName,
		userColor:userColor,
		targetName:null
	})-1
	// console.log('clients index: ',index)
	connection.on('message',function(message){
		if (message.type==='utf8') {
			if (clients[index].userName===false) {
				userName=htmlEntities(message.utf8Data);
				//userColor=colors.shift()
				sessionParser(request.httpRequest, {}, function(){
					request.httpRequest.session.username=userName
					//console.log(request.httpRequest.session.usercolor)
					userColor=request.httpRequest.session.usercolor===undefined
				        	?colors.shift()
				        	:request.httpRequest.session.usercolor				        
					request.httpRequest.session.usercolor=userColor
					// console.log(request.cookies)
					request.httpRequest.session.cid=request.cookies[0].value
					// console.log(request.httpRequest.session.cid)
			        request.httpRequest.session.save(function(error){
			        	if (error) {
			        		console.log("SESSION SAVE ERROR:",error)
			        	}

			        	connection.sendUTF(JSON.stringify({
							type:'color',
							data:userColor
						}))
			        })
			    });
			    // console.log(userColor)
				
				clients[index].userName=userName
				clients[index].userColor=userColor
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
			}else {
				console.log((new Date()) + ' Received Message from ' + userName + ': ' + message.utf8Data);
				var obj={
					time:(new Date()).getTime(),
					author:userName,
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

	connection.on('close', function(connection) {
		if (userName !== false && userColor !== false) {
			if (websocket_close_flag===true) {
				websocket_close_flag=false;
				clients.splice(index, 1);
			}
			console.log('CLOSING, now clients length: ',clients.length)
			// console.log('client index: ',index)
			// console.log('client: ',clients[index])
			
			// remove user from the list of connected clients
			//clients.splice(index, 1);
			// push back user's color to be reused by another user
			colors.push(userColor);
		}
	});
})

function inquirePrivateDialoguesFromDB(userName,callback){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')

		findOneFromDB(userName,function(uid){
			messengerDB.collections(function(error,result){
				var hasprivate=false;
				result.forEach(function(entry){
					if (entry.s.name.indexOf(uid)>-1){
						hasprivate=true;
					}
				})

				if (hasprivate===true) {
					result.forEach(function(entry){
						if (entry.s.name.indexOf(uid)>-1) {
							var target_uid='';
							if ( entry.s.name.indexOf('_host_'+uid)>-1 ){
								target_uid=entry.s.name.split('_host_'+uid)[1].split('_guest_')[1]
							}else if ( entry.s.name.indexOf('_guest_'+uid)>-1 ) {
								target_uid=entry.s.name.split('_guest_'+uid)[0].split('dialogues_host_')[1]
							}
							findUidFromDB(target_uid,function(targetName){
								callback({
									collectionName:entry.s.name,
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw('step1:'+error)
		}
		var messengerDB=mongo.db('messenger')

		//excute already login		
		var _connection=clients.filter(function(data){
			return data.userName==entry.name
		});
		// console.log('Already login: ',_connection.length)
		if (_connection.length>0) {
			mongo.close();
			return callback()
		}

		messengerDB.collection('conversations').findOne(
			{
				name:entry.name
			},
			function(error,result){
				if (!result) {
					callback(registerFunc(mongo,messengerDB,entry),{type:'register'})
				}else {
					bcrypt.compare(entry.password,result.password,function(error,result){
						if (result==true){
							console.log('Welcome '+entry.name)
							mongo.close();
						}else {
							console.log('Password invalid.')
							mongo.close();
						}
						callback(result,{type:'login'})
					})
				}				
			}
		)
	})
}

function registerFunc(database,collection,entry){
	var mongo=database
	var messengerDB=collection
	bcrypt.hash(entry.password,10,function(error,hash){
		if(error){
			throw('bcrypt error: '+error)
		}
		entry.password=hash;
		messengerDB.collection('conversations').insertOne(entry,function(error,result){
			if(error) {
				throw('step3:'+error)
			}			
			console.log(entry.name+' registered, welcome!')
			mongo.close();
		})
	})
	return entry;
}

function insertDialogueToDB(entry,options){
	var _db_collection_pointer=db_collection_pointer;
	if (options!==undefined) {
		if (options.databaseCollection!==undefined) {
			_db_collection_pointer=options.databaseCollection
		}
	}	
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
		MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
							if (entry.s.name.indexOf(result[0]._id)>-1 && entry.s.name.indexOf(result[1]._id)>-1) {
								return entry
							}
						})
						if (collection_exist.length>0){
							console.log(collection_exist[0].s.name)
							callback(collection_exist[0].s.name,'export');
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
			messengerDB.collection(db_collection_pointer).find({}).sort({"time":1}).toArray(function(error,result){
				if(error) {
					throw(error)
				}						
				next(result,'public')
			})
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
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