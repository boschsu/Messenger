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
			if (url.parse(request.url).pathname=='/postlogin'){
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
			}else if(url.parse(request.url).pathname=='/getlogout'){
				var sid_name=querystring.parse( url.parse(request.url).query ).sid_name
				beremove_clients=clients.filter(function(client){
					var addr=null;
					// if (client.userName===sid_name) {
					// 	console.log('found ws connect and remove')
					// 	addr=client.connection.remoteAddress
					// 	clients.pop(client)
					// 	console.log("Peer " + addr + " disconnected.");
					// }
					// return clients

					return client.userName===sid_name
				})
				console.log('clients length: ',clients.length)
				console.log('beremove_clients length: ',beremove_clients.length)
				beremove_clients.forEach(function(client){
					client.connection.close()
					clients.pop(client)
				})
				console.log('END clients length: ',clients.length)

				response.writeHead(200,{
					'Content-Type':'text/html'
				});
				response.end('logout success');
			}else if (url.parse(request.url).pathname=='/postrefresh'){
				var _data='';
				request.on('data',function(data){
					_data+=data;
				})
				request.on('end',function(){
					response.writeHead(200, {'Content-Type': 'application/json'});
					var _result=querystring.parse(_data)
					var result=JSON.stringify(_result)
					validateSessionFromDB(request.sessionID,decodeURIComponent(request.headers.cookie.split('=')[1].split(';')[0]),function(result){
						console.log(result)
						if (!result) {
							response.end('');
						}else {
							response.end('refresh on valid');
						}
					})
				})
			}else {
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

ws.on('request',function(request){
	var connection=request.accept(null,request.origin)
	console.log("Websocket connection from "+request.origin+' accepted.');
	var userName=false;
	var userColor=false;
	var index=clients.push({
		connection:connection,
		remoteAddress:connection.remoteAddress,
		userName:userName,
		userColor:userColor
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
				
				exportDialogueFromDB(function(result){
					if (result.length>0) {
						connection.sendUTF(JSON.stringify({
							type:'history',
							data:result
						}))
					}
				})
			}else {
				console.log((new Date()) + ' Received Message from ' + userName + ': ' + message.utf8Data);
				var obj={
					time:(new Date()).getTime(),
					author:userName,
					text:htmlEntities(message.utf8Data),					
					color:userColor
				}
				insertDialogueToDB(obj);
				history=history.slice(-100)

				var json=JSON.stringify({
					type:'message', 
					data: obj 
				});
				// console.log('clients length: ',clients.length)
				for (var i=0;i<clients.length;i++){
					clients[i].connection.sendUTF(json)//boradcast message to all connections
				}
			}
		}		
	})

	connection.on('close', function(connection) {
		if (userName !== false && userColor !== false) {
			console.log('CLOSE clients length: ',clients.length)
			// console.log('client index: ',index)
			// console.log('client: ',clients[index])
			
			// remove user from the list of connected clients
			//clients.splice(index, 1);
			// push back user's color to be reused by another user
			colors.push(userColor);
		}
	});
})

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

function insertDialogueToDB(entry){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')	
		
		messengerDB.collection('dialogues').insertOne(entry,function(error,result){
			if(error) {
				throw(error)
			}
			console.log('Inserted one dialogue.')
			mongo.close();
		})			
	})
}

function exportDialogueFromDB(next){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		
		messengerDB.collection('dialogues').find({}).sort({"time":1}).toArray(function(error,result){
			if(error) {
				throw(error)
			}			
			mongo.close();
			next(result)
		})
	})
}

function validateSessionFromDB(sid,cid,callback){
	MongoClient.connect(url_db,{ useNewUrlParser: true },function(error,mongo){
		if (error) {
			throw(error)
		}
		var messengerDB=mongo.db('messenger')
		var _sid={
			_id:sid
		}
		console.log('_sid: ',_sid)
		console.log('cid: ',cid)
		var datas=messengerDB.collection('sessions').findOne(_sid,function(error,result){
			if (error) {
				throw(error)
			}
			console.log('entry in db by sid: ',result)
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