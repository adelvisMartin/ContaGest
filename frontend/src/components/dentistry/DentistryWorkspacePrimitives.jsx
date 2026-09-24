import React from 'react';
import { Paper, Stack, Typography } from '@mui/material';
import { CgStatusChip } from '../ui/cg/CgPrimitives.jsx';

export function Metric({label,value,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.4,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      <Typography variant="h5" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography>
      <CgStatusChip label={String(value)} tone={tone}/>
    </Stack>
  </Paper>;
}
