export type HipicoMoney={minor:bigint;scale:2};

function stripMoney(value:string){
  return value.trim().replace(/\s+/g,'').replace(/(?:Bs\.?|VES|USD|US\$|\$)/gi,'');
}

export function parseHipicoMoney(value:string|number|bigint):HipicoMoney{
  if(typeof value==='bigint')return{minor:value*100n,scale:2};
  const raw=stripMoney(String(value));
  if(!raw)throw new Error('HIPICO_MONEY_EMPTY');
  if(/[eE]/.test(raw))throw new Error('HIPICO_MONEY_EXPONENT_NOT_ALLOWED');
  const sign=raw.startsWith('-')?-1n:1n;
  const unsigned=raw.replace(/^[+-]/,'');
  if(!/^\d[\d.,]*$/.test(unsigned))throw new Error('HIPICO_MONEY_INVALID');

  const lastComma=unsigned.lastIndexOf(',');
  const lastDot=unsigned.lastIndexOf('.');
  let decimalSep='';
  if(lastComma>=0&&lastDot>=0)decimalSep=lastComma>lastDot?',':'.';
  else if(lastComma>=0){
    const tail=unsigned.length-lastComma-1;
    decimalSep=tail<=2?',':'';
  }else if(lastDot>=0){
    const tail=unsigned.length-lastDot-1;
    decimalSep=tail<=2?'.':'';
  }

  let integerPart=unsigned;
  let fraction='';
  if(decimalSep){
    const index=unsigned.lastIndexOf(decimalSep);
    integerPart=unsigned.slice(0,index);
    fraction=unsigned.slice(index+1);
  }
  integerPart=integerPart.replace(/[.,]/g,'');
  fraction=fraction.replace(/[.,]/g,'');
  if(!/^\d+$/.test(integerPart||'0')||!/^(?:\d{0,2})$/.test(fraction))throw new Error('HIPICO_MONEY_INVALID_SCALE');
  const cents=(fraction+'00').slice(0,2);
  return{minor:sign*(BigInt(integerPart||'0')*100n+BigInt(cents||'0')),scale:2};
}

export function moneyMinorString(value:string|number|bigint){return parseHipicoMoney(value).minor.toString();}
export function addHipicoMoney(...values:Array<HipicoMoney|bigint>){
  return values.reduce<bigint>((sum,item)=>sum+(typeof item==='bigint'?item:item.minor),0n);
}
export function reverseMinor(minor:bigint|string){return(-BigInt(minor)).toString();}
export function formatMinor(minor:bigint|string){
  const value=BigInt(minor);const negative=value<0n;const abs=negative?-value:value;
  const whole=(abs/100n).toString();const cents=(abs%100n).toString().padStart(2,'0');
  return`${negative?'-':''}${whole}.${cents}`;
}
