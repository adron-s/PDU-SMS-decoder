"use strict";

import PduSMS from './pdu-sms.js';

let pdu = new PduSMS();

/* encode tests
//let message = "Hello world! It's work!";
//let message = "Привет. Сегодня 2 июня. Тест 999.";
let buf = pdu.encode({
	phone: "+37066426731",
	message: message
});
console.log("AT+CMGS=" + pdu.get_cmgs_len(buf));
console.log(buf.UD);
console.log("----");
//process.exit(0); */

/* decode tests */
let buf1 = '07917360489991F94409D0D432BB2C030008021061413024805C05' + '0003C60303' + '00730033002F006100380038003200370032003900330064003400650039003F00730067007500690064003D00310032003000370032003200300039005F0031003500370037003600360034003000300030000D000A';
let buf2 = '07917360489991F9040B917360466237F100080250010160902122' + '041F04400438043204350442002E0020041A0430043A002004340435043B0430002E';
let buf3 = '07917360489991F9040B917360466237F10000025011816341210A' + 'D4F29C1E8BC964B319';
let buf4 = '07917360489991F9040B917360466237F100000250118104332151' + '54747A0E4ACF416190BD2CCF83D86FF719D42ECFE7E173197447A7C768D01CFDAEB3C9A039FA7D07D1D1613A888E2E836E20719A0E12A7E9A0FB5BBE9E83C66FB9BC3CA6B3F321';
let buf5  = '07917360489991F9040B917360466237F100000250312112552107' + '61F1985C369F01';
let buf6  = '07915892000000F001000B915892214365F7000021' + '493A283D0795C3F33C88FE06CDCB6E32885EC6D341EDF27C1E3E97E72E';
let buf7  = '07912160130350F7040B912110883808F400000260214125610A0BD4F29C0E0ABBE7F7B21C';
let buf8  = '07917360489991F9' + '040B917360466237F1000802602132913321060410043A043E';
let buf9  = '0791795155155581' + '6406D0E4BA0B000002014151644261080500032E05055C';
let buf10 = '07917951551555816006D0E4BA0B000002014151644261A0' + '0500032E0504' + 'E8747619947FD7E5A0' +
	'F078FCAEBBE9A0B71C340EB3D9A0FA1C14A68360B41B8C26CBD56E20F35B0E6ABFE56550DA6D7ECBDB617AFAED7681926650FE5D9783E0E17CBBECA683D0E13928CC9697C3E43C485C2EBB41F3BAB89DA6D3CB6416E85E06D1D161F71A947FD741613719046797C3F332889C9ECBCBE7B09C0CA2A3D37390FB4D4F8FCB';
//0B 91 7360466237F
let bufs = [ buf10 ] //buf1, buf2, buf3, buf4 ];
//bufs = require('fs').readFileSync("./data.txt").toString().split("\n");
bufs.forEach((buf, i) => {
	//console.log(i);
	console.log(buf, buf.length);
	if(pdu.decode(buf) === false)
		return;
	console.log(pdu.toString());
	console.log("");
});
