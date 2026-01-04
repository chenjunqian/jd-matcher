package telegram

// Command Constants
const (
	COMMON_ERROR_REPLY = "There is something wrong with my service. Please try again later."
	LOGIN_HINT = "Please use /start command to login again."

	START_COMMAND = "/start"
	START_COMMAND_ERROR_REPLY = "Hi %s ! I'm a bot that can help you find a job. Seems like there is something wrong with my service. Please try again later."
	START_COMMAND_REPLY = "Hi %s ! I'm a bot that can help you find a job. You can use /jobs to get all available jobs for you. \nYou can use /upload_resume to upload your resume."

	HELP_COMMAND  = "/help"

	JOBS_COMMAND = "/jobs"

	ALL_JOBS_COMMAND = "/all_jobs"

	UPLOAD_RESUME_COMMAND = "/upload_resume"
	UPLOAD_RESUME_SUCCESS_REPLY = "Your resume has been uploaded! We will notify you when we find a job for you. You can also use /jobs to view all available jobs for you."
	UPLOAD_RESUME_HINT = "Please upload your resume file."
	UPLOAD_RESUME_TYPE_ERROR = "Please upload your resume with text file."
	RESUME_EXIST_REPLY = "You have already uploaded your resume. If you want to update your resume, please upload it again."

	EXPECTATION_COMMAND = "/expectation"
	EXPECTATION_DESCRIPTION = "Set your job expectations (location, salary, language, work setup)"
	EXPECTATION_HINT_EMPTY = "Please enter your job expectations. This will help us find better matching jobs for you. For example: 'Remote, Shanghai, Python, English'"
	EXPECTATION_HINT_EXISTS = "Your current expectations:\n---\n%s\n---\nPlease enter your new expectations. This will OVERWRITE your previous expectations."
	EXPECTATION_SUCCESS_REPLY = "Your job expectations have been saved!"
)