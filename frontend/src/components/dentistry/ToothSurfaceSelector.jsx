import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';

export const SURFACE_LAYOUT=[
  {value:'vestibular',label:'Vestibular',area:'vestibular'},
  {value:'lingual_palatal',label:'Lingual / palatina',area:'lingual'},
  {value:'mesial',label:'Mesial',area:'mesial'},
  {value:'distal',label:'Distal',area:'distal'},
  {value:'occlusal_incisal',label:'Oclusal / incisal',area:'occlusal'}
];

export function ToothSurfaceSelector({selectedSurfaces=[],onChange,disabled=false}){
  const selected=Array.isArray(selectedSurfaces)?selectedSurfaces:[];

  function toggleSurface(surface){
    if(disabled)return;
    const next=selected.includes(surface)
      ? selected.filter((item)=>item!==surface)
      : [...selected,surface];
    onChange?.(next);
  }

  return <Stack gap={.8}>
    <Box
      role="group"
      aria-label="Superficies de la pieza dental"
      sx={{
        display:'grid',
        gridTemplateColumns:'repeat(3,minmax(44px,64px))',
        gridTemplateRows:'repeat(3,minmax(44px,64px))',
        gridTemplateAreas:'". vestibular ." "mesial occlusal distal" ". lingual ."',
        gap:.5,
        justifyContent:'start',
        alignItems:'stretch'
      }}
    >
      {SURFACE_LAYOUT.map((surface)=>{
        const pressed=selected.includes(surface.value);
        return <ButtonBase
          key={surface.value}
          type="button"
          aria-label={surface.label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={()=>toggleSurface(surface.value)}
          sx={{
            gridArea:surface.area,
            minWidth:44,
            minHeight:44,
            border:'1px solid',
            borderColor:pressed?'primary.main':'divider',
            bgcolor:pressed?'primary.main':'background.paper',
            color:pressed?'primary.contrastText':'text.primary',
            borderRadius:surface.value==='occlusal_incisal'?2:1.5,
            px:.75,
            py:.5,
            textAlign:'center',
            transition:(theme)=>theme.transitions.create(['background-color','border-color','color'],{
              duration:theme.transitions.duration.shortest
            }),
            '@media (prefers-reduced-motion: reduce)':{transition:'none'},
            '&:focus-visible':{
              outline:'3px solid',
              outlineColor:'primary.light',
              outlineOffset:2
            },
            '&.Mui-disabled':{
              opacity:.45
            }
          }}
        >
          <Typography variant="caption" fontWeight={pressed?700:600} lineHeight={1.15}>
            {surface.label}
          </Typography>
        </ButtonBase>;
      })}
    </Box>
    <Typography variant="caption" color="text.secondary">
      {disabled
        ? 'Selecciona una pieza dental para habilitar sus superficies.'
        : selected.length
          ? `${selected.length} superficie(s) seleccionada(s).`
          : 'Selecciona una o más superficies de la pieza.'}
    </Typography>
  </Stack>;
}
