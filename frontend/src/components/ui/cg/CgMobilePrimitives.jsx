import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgEmptyState } from './CgPrimitives.jsx';

export const CG_MOBILE_BREAKPOINTS=Object.freeze({phoneMin:360,phonePrimary:390,phoneWide:430,tablet:768,desktop:1440});
export const CG_TOUCH_TARGET_PX=44;

export function CgResponsivePage({children,sx={}}){
  return <Box data-cg-mobile="page" sx={{width:'100%',maxWidth:'100%',minWidth:0,overflowX:'clip',px:{xs:1.5,sm:2,lg:2.5},pb:{xs:10,sm:3},...sx}}>{children}</Box>;
}

export function CgResponsiveStack({children,direction={xs:'column',sm:'row'},gap=1.5,alignItems={xs:'stretch',sm:'center'},sx={}}){
  return <Stack data-cg-mobile="stack" direction={direction} gap={gap} alignItems={alignItems} sx={{minWidth:0,maxWidth:'100%',...sx}}>{children}</Stack>;
}

export function CgResponsiveGrid({children,minColumn=240,columns='auto-fit',gap=1.5,sx={}}){
  return <Box data-cg-mobile="grid" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:`repeat(${columns}, minmax(min(100%, ${minColumn}px), 1fr))`},gap,minWidth:0,maxWidth:'100%',...sx}}>{children}</Box>;
}

export function CgMetricGrid({children,sx={}}){
  return <Box data-cg-mobile="metric-grid" sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'repeat(auto-fit,minmax(150px,1fr))'},gap:{xs:1,sm:1.5},minWidth:0,maxWidth:'100%',...sx}}>{children}</Box>;
}

export function CgMetricCard({label,value,detail=null,children,sx={}}){
  return <Paper variant="outlined" data-cg-mobile="metric" sx={{p:{xs:1.25,sm:1.5},minWidth:0,overflow:'hidden',...sx}}>
    <Typography variant="caption" color="text.secondary" sx={{display:'block',fontWeight:650,lineHeight:1.25,overflowWrap:'anywhere'}}>{label}</Typography>
    <Typography variant="h6" component="p" sx={{mt:.5,fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>{value}</Typography>
    {detail?<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:.35,overflowWrap:'anywhere'}}>{detail}</Typography>:null}
    {children}
  </Paper>;
}

export function CgMobileNav({children,label='Navegación de sección',sx={}}){
  return <Box role="navigation" aria-label={label} data-cg-mobile="nav-strip" tabIndex={0} sx={{display:'flex',alignItems:'center',gap:1,width:'100%',maxWidth:'100%',minWidth:0,overflowX:'auto',overscrollBehaviorInline:'contain',scrollSnapType:'x proximity',WebkitOverflowScrolling:'touch',py:.5,px:.25,'& > *':{flex:'0 0 auto',scrollSnapAlign:'start',minHeight:CG_TOUCH_TARGET_PX},...sx}}>{children}</Box>;
}

export function CgActionBar({children,stickyMobile=false,sx={}}){
  return <Box data-cg-mobile="action-bar" sx={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:{xs:'stretch',sm:'flex-end'},gap:1,minWidth:0,maxWidth:'100%',...(stickyMobile?{position:{xs:'fixed',sm:'static'},left:{xs:0,sm:'auto'},right:{xs:0,sm:'auto'},bottom:{xs:0,sm:'auto'},zIndex:{xs:1200,sm:'auto'},p:{xs:1.25,sm:0},bgcolor:{xs:'background.paper',sm:'transparent'},borderTop:{xs:1,sm:0},borderColor:'divider'}:{}),'& > button,& > a':{minHeight:CG_TOUCH_TARGET_PX,flex:{xs:'1 1 140px',sm:'0 0 auto'}},...sx}}>{children}</Box>;
}

export function CgFormGrid({children,sx={}}){
  return <Box data-cg-mobile="form-grid" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'repeat(2,minmax(0,1fr))'},gap:{xs:1.5,sm:2},minWidth:0,maxWidth:'100%','& input,& textarea,& select':{fontSize:{xs:16,sm:'inherit'}},...sx}}>{children}</Box>;
}

export function CgSafeTable({children,label='Tabla de datos',minWidth=640,sx={}}){
  return <Box role="region" aria-label={label} tabIndex={0} data-cg-mobile="safe-table" sx={{width:'100%',maxWidth:'100%',minWidth:0,overflowX:'auto',overscrollBehaviorInline:'contain',WebkitOverflowScrolling:'touch',borderRadius:1,'& > table,& .MuiTable-root':{minWidth},...sx}}>{children}</Box>;
}

export function CgMobileEmptyState({title='Sin datos',description='No hay información disponible para esta vista.',action=null}){
  return <Box data-cg-mobile="empty" sx={{minWidth:0,maxWidth:'100%'}}><CgEmptyState title={title} description={description} action={action}/></Box>;
}

export function CgNoBodyOverflowBoundary({children}){
  return <Box data-cg-mobile="overflow-boundary" sx={{width:'100%',maxWidth:'100%',minWidth:0,'& *':{boxSizing:'border-box'},'& img,& svg,& canvas,& video':{maxWidth:'100%'}}}>{children}</Box>;
}
