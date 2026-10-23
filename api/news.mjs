import {newsResponse} from '../server/news.mjs';
export default {fetch:request=>newsResponse(request)};
