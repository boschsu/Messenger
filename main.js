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
var sessionParser=expressSession({ name: 'MessengerID', secret: 'node messenger', resave: false, saveUninitialized: true, cookie: { secure: false } })
app.use(sessionParser)

var server=http.createServer(
	
	app.use(

		function(request,response){

			var ip = request.clientIP;
			var session=request.session;
			//console.log(session)
			if (url.parse(request.url).pathname=='/postlogin'){
				var _data='';
				request.on('data',function(data){
					_data+=data;
				})
				request.on('end',function(){
					response.writeHead(200, {'Content-Type': 'application/json'});
					// var data={
					// 	name:'高级'
					// }
					// response.end( JSON.stringify(_data) );
					// var result=decodeURIComponent(_data)
					var _result=querystring.parse(_data)
					var result=JSON.stringify(_result)
					if (validationData(_result)) {
						insertOneToDB(_result,function(result,options){
							if (!result) {
								response.end('');//wrong password
							}else {
								switch(options.type) {
									case 'register':
										session.username=_result.name
										session.usercolor=userColor
										response.end('{"name":"'+result.name+'"}')
										break;
									case 'login':
										session.username=_result.name
										session.usercolor=userColor
										response.end('{"name":"'+_result.name+'"}')									
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
				//console.log(request.query)
				userName=false;
				userColor=false;
				session=null;
				// console.log(session)
				// session.destroy(function(error){
				// 	console.log("SESSION DESTORY ERROR:",error)
				// })
				response.writeHead(200,{
					'Content-Type':'text/html'
				});
				response.end('success');
			}else {
				var fileName=path.basename(request.url) || 'index.html';
				var fullPath=__dirname+'/src/'+fileName;
				console.log('Request for '+fullPath+' received.\r\n^^^Client ip is '+ip);
				//console.log(session)
				if (!session.username) {
					//session.username='humor'
				}else {
					// console.log('Session Username: ',session.username)
					// console.log('Session Usercolor: ',session.usercolor)
					userName=session.username
					userColor=session.usercolor
					exportDialogueFromDB(function(result){
						if (result.length>0) {
							connection.sendUTF(JSON.stringify({
								type:'history',
								data:result,
								name:userName,
								color:userColor
							}))
						}
					})
				}
				// console.log('Session Username : ',session.username)
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
var clients=[]
var connection;
var userName=false;
var userColor=false;

ws.on('request',function(request){
	connection=request.accept(null,request.origin)
	console.log("Websocket connection from "+request.origin+' accepted.');

	var index=clients.push(connection)-1

	connection.on('message',function(message){
		if (message.type==='utf8') {
			if (userName===false) {
				userName=htmlEntities(message.utf8Data);
				userColor=colors.shift()
				sessionParser(request.httpRequest, {}, function(){
					request.httpRequest.session.usercolor=userColor
			        request.httpRequest.session.save(function(error){
			        	if (error) {
			        		console.log("SESSION SAVE ERROR:",error)
			        	}
			        })
			    });
				connection.sendUTF(JSON.stringify({
					type:'color',
					data:userColor
				}))				
				console.log('session usercolor created')
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
				for (var i=0;i<clients.length;i++){
					clients[i].sendUTF(json)//boradcast message to all connections
				}
			}
		}
	})

	connection.on('close', function(connection) {
		if (userName !== false && userColor !== false) {
			console.log((new Date()) + " Peer "
				+ connection.remoteAddress + " disconnected.");
			// remove user from the list of connected clients
			clients.splice(index, 1);
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
		// var entryExist=false;

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
				
			})
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
		
		messengerDB.collection('dialogues').find({}).toArray(function(error,result){
			if(error) {
				throw(error)
			}			
			mongo.close();
			next(result)
		})
	})
}

function validationData(data) {
	if (data.name==='') {
		return false;
	}else {
		return true
	}
}