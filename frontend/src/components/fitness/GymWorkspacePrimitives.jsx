import React from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgEmptyState, CgStatusChip } from '../ui/cg/CgPrimitives.jsx';

export function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.35,minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="h5" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography><CgStatusChip label={hint||String(value)} tone={tone}/></Stack></Paper>;
}

export function Section({title,description,children,action=null,wide=false}){
  return <Paper variant="outlined" sx={{p:1.5,minWidth:0,gridColumn:wide?'1/-1':undefined}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">{title}</Typography>{description?<Typography variant="caption" color="text.secondary">{description}</Typography>:null}</Box>{action}</Stack>
    <Divider sx={{my:1.15}}/>{children}
  </Paper>;
}

export function RecordList({items,empty,render,assetKey='gym'}){
  if(!items.length)return <CgEmptyState title={empty} description="Los nuevos registros aparecerán aquí." assetKey={assetKey}/>;
  return <Stack className="cg-gym-v1124-list" divider={<Divider flexItem/>}>{items.map((item,index)=><Box key={item.id||index} py={.8}>{render(item)}</Box>)}</Stack>;
}
