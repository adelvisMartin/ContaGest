import { Router } from 'express';
import policy from './api-contract-v1.json' with { type: 'json' };
import openapi from './openapi-v1.generated.json' with { type: 'json' };
import catalog from './api-route-catalog-v1.generated.json' with { type: 'json' };

const router=Router();

router.use((_req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  next();
});

router.get('/openapi.json',(_req,res)=>{
  res.status(200).json(openapi);
});

router.get('/contract.json',(_req,res)=>{
  res.status(200).json({
    ok:true,
    data:{policy,catalog},
    meta:{schemaVersion:policy.schemaVersion,apiVersion:policy.apiVersion}
  });
});

export default router;
