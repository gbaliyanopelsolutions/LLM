'use strict';

const express = require('express');
const {
	listCompanies,
	createCompany,
	getCompanyById,
	updateCompany,
	deleteCompany,
	generateSurveyJson,
	saveSurvey,
	getPublicSurvey,
	submitSurvey,
	listSurveys,
	getSurveyById,
	updateSurvey,
	deleteSurvey,
	createSubmission,
} = require('../lib/surveyBuilderService.js');

/**
 * @param {{ anthropic: import('@anthropic-ai/sdk').default, model: string, upload: import('multer').Multer }} deps
 */
function createSurveyBuilderRouter({ anthropic, model, upload }) {
	const router = express.Router();

	router.get('/companies', async (req, res) => {
		const out = await listCompanies();
		res.status(out.status).json(out.json);
	});

	router.post('/companies', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await createCompany(body);
		res.status(out.status).json(out.json);
	});

	router.get('/companies/:companyId', async (req, res) => {
		const out = await getCompanyById(req.params.companyId);
		res.status(out.status).json(out.json);
	});

	router.patch('/companies/:companyId', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await updateCompany(req.params.companyId, body);
		res.status(out.status).json(out.json);
	});

	router.delete('/companies/:companyId', async (req, res) => {
		const out = await deleteCompany(req.params.companyId);
		res.status(out.status).json(out.json);
	});

	router.post('/companies/:companyId/upload', upload ? upload.single('file') : (req, res, next) => next(), async (req, res) => {
		if (!upload) {
			res.status(500).json({ ok: false, error: 'File upload not configured' });
			return;
		}
		if (!req.file) {
			res.status(400).json({ ok: false, error: 'No file uploaded' });
			return;
		}
		const url = `/uploads/${req.file.fieldname === 'banner' ? 'company-banners' : 'company-logos'}/${req.file.filename}`;
		res.json({ ok: true, url });
	});

	router.post('/submissions', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await createSubmission(body);
		res.status(out.status).json(out.json);
	});

	router.post('/generate-survey-json', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await generateSurveyJson({ anthropic, model, body });
		res.status(out.status).json(out.json);
	});

	router.post('/surveys/save', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await saveSurvey(body);
		res.status(out.status).json(out.json);
	});

	router.get('/surveys', async (req, res) => {
		const out = await listSurveys({
			search: typeof req.query.q === 'string' ? req.query.q : '',
			page: req.query.page,
			pageSize: req.query.pageSize,
		});
		res.status(out.status).json(out.json);
	});

	router.get('/surveys/:surveyId/public', async (req, res) => {
		const out = await getPublicSurvey(req.params.surveyId);
		res.status(out.status).json(out.json);
	});

	router.post('/surveys/:surveyId/submit', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await submitSurvey(req.params.surveyId, body);
		res.status(out.status).json(out.json);
	});

	router.get('/surveys/:surveyId', async (req, res) => {
		const out = await getSurveyById(req.params.surveyId);
		res.status(out.status).json(out.json);
	});

	router.patch('/surveys/:surveyId', async (req, res) => {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const out = await updateSurvey(req.params.surveyId, body);
		res.status(out.status).json(out.json);
	});

	router.delete('/surveys/:surveyId', async (req, res) => {
		const out = await deleteSurvey(req.params.surveyId);
		res.status(out.status).json(out.json);
	});

	return router;
}

module.exports = { createSurveyBuilderRouter };
