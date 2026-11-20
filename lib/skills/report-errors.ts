export class ReportModelError extends Error {
  constructor(readonly code:'model_configuration'|'model_access'|'model_request'|'model_response'|'model_unavailable',message:string){super(message);this.name='ReportModelError';}
}

export class ReportSkillError extends Error {
  constructor(readonly code:'analysis_validation'|'analysis_storage'|'analysis_input',readonly reference:string,message:string){super(message);this.name='ReportSkillError';}
}
