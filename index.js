var express = require('express');
var exphbs = require('express-handlebars');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var md5 = require('js-md5');

const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://coreskills-d99ea.firebaseio.com"
});

let db = admin.firestore();

var app = express();

var hbs = exphbs.create({
    // Specify helpers which are only registered on this instance.
    helpers: {
        isCompleted: (status) => {
            return status === "Assignment Completed";
        },
        isDroppedOut: (status) => {
            return status === "Dropped out";
        },
        isPassed: (result) => {
            return result === "passed";
        },
        isGreen: (score) => {
            return score >= 80;
        },
        isYellow: (score) => {
            return score >= 60 && score < 80;
        },
        isOrange: (score) => {
            return score >= 40 && score < 60;
        },
        isRed: (score) => {
            return score < 40;
        }
    }
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

app.use('/static', express.static('public'))
app.use(cookieParser())
app.use(attachCsrfToken('/', 'csrfToken', (Math.random() * 100000000000000000).toString()));
app.use(bodyParser.json());
// Support URL-encoded bodies.
app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/', (req, res) => {
    const sessionCookie = req.cookies.session || '';
    admin.auth().verifySessionCookie(
        sessionCookie, true /** checkRevoked */)
        .then(async (decodedClaims) => {
            const userRef = db.collection("users").doc(decodedClaims.user_id);
            const user = await userRef.get();
            const organizationRef = user.data().organization;
            const organization = await organizationRef.get();
            const roleName = organization.data().role;
            const candidatesQuerySnapshot = await organizationRef.collection('candidates').get();
            const candidateList = candidatesQuerySnapshot.docs
                .map(snapshot => snapshot.data())
                .sort(function(a, b){return Date.parse(b.expiresOn) - Date.parse(a.expiresOn)})

            res.render('candidates', {
                title: 'Candidate Dashboard',
                displayName: user.data().displayName,
                avatar: user.data().avatar,
                email: user.data().email,
                candidates: candidateList,
                role: roleName
            });
        })
        .catch(error => {
            res.render('login', {title: "Login"});
        });
});

app.post('/sessionLogin', async (req, res) => {
    const idToken = req.body.idToken.toString();
    const csrfToken = req.body.csrfToken.toString();

    if (csrfToken !== req.cookies.csrfToken) {
        res.status(401).send('UNAUTHORIZED REQUEST!');
        return;
    }

    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    admin.auth().createSessionCookie(idToken, { expiresIn })
        .then((sessionCookie) => {
            // Set cookie policy for session cookie.
            const options = { maxAge: expiresIn, httpOnly: true, secure: false };
            res.cookie('session', sessionCookie, options);
            res.end(JSON.stringify({ status: 'success' }));
        }, error => {
            res.status(401).send('UNAUTHORIZED REQUEST!');
        })
})

app.get('/forgot-password', (req, res) => {
    res.render("forgot-password");
});

app.get('/reset-email-sent', (req, res) => {
    res.render("reset-email-sent");
});

app.post('/sendAssignment', async (req, res) => {
    const organizationId = req.body.organizationId.toString();
    const company = req.body.company.toString();
    const role = req.body.role.toString();
    const fullName = req.body.fullName.toString();
    const emailAddress = req.body.emailAddress.toString();
    admin.firestore().collection('mail').add({
        to: 'anton@coreskills.dev',
        message: {
          subject: '✅ Coreskills: New Candidate',
          html: `
            <ul>
              <li>Company: ${company}</li>
              <li>Role: ${role}</li>
              <li>Full Name: ${fullName}</li>
              <li>Email: ${emailAddress}</li>
            </ul>
          `,
        },
    });
    let md5Email = md5(emailAddress);
    db.collection('organizations').doc(organizationId).collection('candidates').add({
        avatar: `https://www.gravatar.com/avatar/${md5Email}?s=128&d=identicon&r=PG`,
        email: emailAddress,
        fullName: fullName,
        expiresOn: '(pending)',
        status: "Sending assignment"
    });
    res.end(JSON.stringify({ status: 'success' }));
});

app.get('/candidate/:email', function (req, res) {
    const sessionCookie = req.cookies.session || '';
    admin.auth().verifySessionCookie(
        sessionCookie, true /** checkRevoked */)
        .then(async (decodedClaims) => {
            const userRef = db.collection("users").doc(decodedClaims.user_id);
            const user = await userRef.get();
            const organizationRef = user.data().organization;
            const organization = await organizationRef.get();
            const roleName = organization.data().role;
            const candidatesQuerySnapshot = await organizationRef.collection('candidates').where("email", "==", req.params.email).get();
            const candidateList = candidatesQuerySnapshot.docs.map(snapshot => snapshot.data());

            res.render('candidate', {
                title: 'Candidate Information',
                role: roleName,
                candidate: candidateList[0],
                displayName: user.data().displayName,
                avatar: user.data().avatar,
                email: user.data().email,
            });
        })
        .catch(error => {
            res.render('login', {title: "Login"});
        });
});
app.get('/challenge-breakdown/:email/:task', function (req, res) {
    const sessionCookie = req.cookies.session || '';
    admin.auth().verifySessionCookie(
        sessionCookie, true /** checkRevoked */)
        .then(async (decodedClaims) => {
            const userRef = db.collection("users").doc(decodedClaims.user_id);
            const user = await userRef.get();
            const organizationRef = user.data().organization;
            const organization = await organizationRef.get();
            const roleName = organization.data().role;
            const candidatesQuerySnapshot = await organizationRef.collection('candidates').where("email", "==", req.params.email).get();
            const candidateList = candidatesQuerySnapshot.docs.map(snapshot => snapshot.data());

            res.render('candidate', {
                title: 'Candidate Information',
                role: roleName,
                candidate: candidateList[0],
                displayName: user.data().displayName,
                avatar: user.data().avatar,
                email: user.data().email,
            });
        })
        .catch(error => {
            res.render('login', {title: "Login"});
        });
});

app.get("/new-candidate", (req, res) => {
    const sessionCookie = req.cookies.session || '';
    admin.auth().verifySessionCookie(
        sessionCookie, true /** checkRevoked */)
        .then(async (decodedClaims) => {
            const userRef = db.collection("users").doc(decodedClaims.user_id);
            const user = await userRef.get();
            const organizationRef = user.data().organization;
            const organization = await organizationRef.get();
            const companyName = organization.data().name;
            const roleName = organization.data().role;

            res.render('new-candidate', {
                title: "Invite Candidate",
                organizationId: organizationRef.id,
                company: companyName,
                role: roleName,
                displayName: user.data().displayName,
                avatar: user.data().avatar,
                email: user.data().email,
            });
        })
        .catch(error => {
            res.render('login', {title: "Login"});
        });
});

app.get('/sessionLogout', (req, res) => {
    res.clearCookie('session');
    res.render('login', {title: "Login"});
  });

app.listen(8080);

function attachCsrfToken(url, cookie, value) {
    return function (req, res, next) {
        if (req.url == url) {
            res.cookie(cookie, value);
        }
        next();
    }
}