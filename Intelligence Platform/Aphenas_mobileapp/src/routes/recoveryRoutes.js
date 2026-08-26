import express from 'express';


import {
  generateRecoveryPhrase,
  confirmRecoveryPhrase,
} from '../controllers/recoveryController.js';


import {
  requireOnboardingToken,
} from '../middlewares/requireOnboardingToken.js';



const router =
  express.Router();




/* =========================================
   GENERATE RECOVERY PHRASE
========================================= */

router.post(

  '/generate',

  requireOnboardingToken,

  generateRecoveryPhrase

);





/* =========================================
   CONFIRM RECOVERY PHRASE
========================================= */

router.post(

  '/confirm',

  requireOnboardingToken,

  confirmRecoveryPhrase

);



export default router;