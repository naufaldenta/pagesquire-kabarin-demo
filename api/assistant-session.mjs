import {assistantResponse} from '../server/assistant.mjs';
export default {fetch:request=>assistantResponse(request,'session')};
