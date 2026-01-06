package telegram

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/service/telegram/all_jobs"
	"jd-matcher/internal/service/telegram/expectation"
	"jd-matcher/internal/service/telegram/help"
	"jd-matcher/internal/service/telegram/jobs"
	"jd-matcher/internal/service/telegram/start"
	"jd-matcher/internal/service/telegram/upload_resume"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

func getAllCommands() []models.BotCommand {
	return []models.BotCommand{
		{
			Command:     "start",
			Description: "Go start to find a job!",
		},
		{
			Command:     "help",
			Description: "Get how to use this bot",
		},
		{
			Command:     "all_jobs",
			Description: "Get all available jobs",
		},
		{
			Command:     "jobs",
			Description: "Get all available jobs for you",
		},
		{
			Command:     "upload_resume",
			Description: "Upload your resume",
		},
		{
			Command:     "expectation",
			Description: EXPECTATION_DESCRIPTION,
		},
	}
}

func handleCommandReply(ctx context.Context, b *bot.Bot, update *models.Update, command string) {
	switch command {
	case START_COMMAND:
		start.Handle(ctx, b, update, &dao.UserInfo)
	case HELP_COMMAND:
		help.Handle(ctx, b, update)
	case ALL_JOBS_COMMAND:
		all_jobs.Handle(ctx, b, update)
	case JOBS_COMMAND:
		jobs.Handle(ctx, b, update, &dao.UserInfo)
	case UPLOAD_RESUME_COMMAND:
		upload_resume.Handle(ctx, b, update, &dao.UserInfo)
	case EXPECTATION_COMMAND:
		expectation.Handle(ctx, b, update, &dao.UserInfo)
	}
}

// handleResumeFileUpload handles resume file upload
func handleResumeFileUpload(ctx context.Context, b *bot.Bot, update *models.Update) {
	upload_resume.HandleFileUpload(ctx, b, update, &dao.UserInfo)
}

// handleExpectationTextInput handles expectation text input
func handleExpectationTextInput(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	expectation.HandleTextInput(ctx, b, update, userInfoDao)
}
