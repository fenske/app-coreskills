const router = require('express').Router();
const firestore = require('firebase-admin').firestore();
const login = require('../actions/auth');

router.get('/scorecard/:candidateEmail', async (req, res) => {
  login(req)
    .then(async (decodedClaims) => {
      const userRef = firestore.collection("users").doc(decodedClaims.user_id);
      const user = await userRef.get();

      if (user.data().role === 'interviewer') {
        const organizationRef = user.data().organization;
        const organization = await organizationRef.get();
        const companyName = organization.data().name;
        const roleName = organization.data().role;

        const candidatesQuerySnapshot = await organizationRef.collection('candidates').where("email", "==", req.params.candidateEmail).get();
        const candidate = candidatesQuerySnapshot.docs.map(snapshot => snapshot.data())[0];

        // If candidate got a scorecard pass that instead
        const scorecard = candidate.scorecard ? candidate.scorecard : organization.data().scorecard;

        scorecard.map(function(req) {
          if (req.result === 'passed') {
            req.result = true;
          } else {
            req.result = false;
          }
          return req;
        });

        res.render('scorecard', {
          title: "New Scorecard",
          organizationId: organizationRef.id,
          company: companyName,
          role: roleName,
          displayName: user.data().displayName,
          avatar: user.data().avatar,
          email: user.data().email,
          scorecard: scorecard,
          candidateEmail: req.params.candidateEmail,
        });
      } else {
        res.status(401).end('Unauthorized');
      }
    })
    .catch(error => {
      res.render('login', { title: "Login" });
    });
});

router.post('/createScorecard', async (req, res) => {
  login(req)
    .then(async (decodedClaims) => {
      const userRef = firestore.collection("users").doc(decodedClaims.user_id);
      const user = await userRef.get();
      const organizationRef = user.data().organization;

      const candidateEmail = req.body.candidateEmail.toString();

      const candidatesQuerySnapshot = await organizationRef.collection('candidates').where("email", "==", candidateEmail).get();
      const candidateRef = candidatesQuerySnapshot.docs[0];

      const scorecardData = req.body.scorecardData;

      scorecardData.map(function(req) {
        if (req.result === 'true') {
          req.result = 'passed';
        } else {
          req.result = 'failed';
        }

        req.skills = req.skills.split(',');
        return req;
      });

      firestore.doc(`organizations/${organizationRef.id}/candidates/${candidateRef.id}`)
        .update({scorecard: scorecardData});

      res.end(JSON.stringify({ status: 'success' }));
    })
    .catch(error => {
      res.status(401).end('Unauthorized');
    });
  console.log(req.body);
  res.end(JSON.stringify({ status: 'success' }));
});

// Exports
module.exports = router;
