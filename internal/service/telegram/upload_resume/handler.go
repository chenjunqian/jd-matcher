package upload_resume

import (
	"context"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/service/llm"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

// Constants for upload_resume module
const (
	CommonErrorReply         = "There is something wrong with my service. Please try again later."
	UploadResumeSuccessReply = "Your resume has been uploaded! We will notify you when we find a job for you. You can also use /jobs to view all available jobs for you."
	UploadResumeHint         = "Please upload your resume file."
	UploadResumeTypeError    = "Please upload your resume with text file."
	ResumeExistReply         = "You have already uploaded your resume. If you want to update your resume, please upload it again."
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	isResumeExist, err := userInfoDao.IsUserHasUploadResume(ctx, gconv.String(update.Message.From.ID))
	if err != nil {
		g.Log().Line().Error(ctx, "check user resume exist error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   CommonErrorReply,
		})
		return
	}

	if isResumeExist {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   ResumeExistReply,
		})
		return
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   UploadResumeHint,
	})
}

// HandleFileUpload handles the file upload for resume
func HandleFileUpload(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	if !gstr.HasPrefix(update.Message.Document.MimeType, "text/") {
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   UploadResumeTypeError,
		})
		return
	}

	receivedFile, err := b.GetFile(ctx, &bot.GetFileParams{
		FileID: update.Message.Document.FileID,
	})

	if err != nil {
		g.Log().Line().Error(ctx, "get file error : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   CommonErrorReply,
		})
		return
	}

	downloadLink := b.FileDownloadLink(receivedFile)
	g.Log().Line().Debugf(ctx, "Get resume download link: %s", downloadLink)

	if resp, err := g.Client().Get(ctx, downloadLink); err != nil {
		g.Log().Line().Error(ctx, "Get resume file failed : ", err)
		b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID: update.Message.Chat.ID,
			Text:   CommonErrorReply,
		})
		return
	} else {
		defer resp.Close()
		resumeContent := resp.ReadAllString()
		g.Log().Line().Debugf(ctx, "Get resume content: %s", resumeContent)
		if resumeContent != "" {
			vector, err := llm.GetOpenAIClient().EmbeddingText(ctx, []string{resumeContent})
			if err != nil {
				g.Log().Line().Error(ctx, "embedding resume error : ", err)
				b.SendMessage(ctx, &bot.SendMessageParams{
					ChatID: update.Message.Chat.ID,
					Text:   CommonErrorReply,
				})
				return
			}
			err = userInfoDao.UpdateUserResume(ctx, gconv.String(update.Message.From.ID), resumeContent, vector[0])
			if err != nil {
				g.Log().Line().Error(ctx, "update user resume error : ", err)
				b.SendMessage(ctx, &bot.SendMessageParams{
					ChatID: update.Message.Chat.ID,
					Text:   CommonErrorReply,
				})
				return
			}
			b.SendMessage(ctx, &bot.SendMessageParams{
				ChatID: update.Message.Chat.ID,
				Text:   UploadResumeSuccessReply,
			})
		}
	}
}

// HandleTextInput handles text input after /upload_resume command
func HandleTextInput(ctx context.Context, b *bot.Bot, update *models.Update, userInfoDao dao.IUserInfo) {
	// Upload resume doesn't expect text input, it expects file upload
	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   "Please upload your resume as a text file.",
	})
}
