package jobs

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

const (
	CallbackDataPrefix   = "matched_jobs_callback_data_"
	CurrentPageData      = CallbackDataPrefix + "current_page_"
	TotalPageData        = CallbackDataPrefix + "total_page_"
	NextPageData         = CallbackDataPrefix + "next_page"
	PrePageData          = CallbackDataPrefix + "pre_page"
)

func BuildKeyboard(ctx context.Context, userId string, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {
	var currentPage int = 0
	// event from callback button, update inline keyboard
	if update.CallbackQuery != nil {
		updateReplyMarkup := update.CallbackQuery.Message.Message.ReplyMarkup
		for _, inlineKeyboard := range updateReplyMarkup.InlineKeyboard {
			if gstr.HasPrefix(inlineKeyboard[0].CallbackData, CurrentPageData) {
				currentPageStr := gstr.TrimLeftStr(inlineKeyboard[0].CallbackData, CurrentPageData)
				currentPage = gconv.Int(currentPageStr)
				break
			}
		}

		switch update.CallbackQuery.Data {
		case PrePageData:
			if currentPage >= 1 {
				currentPage = currentPage - 1
			}
		case NextPageData:
			currentPage = currentPage + 1
		}
	}

	limit := 10
	offset := currentPage * limit
	matchJobList, err := dao.UserMatchedJob.GetUserMatchedJobDetailList(ctx, userId, offset, limit)
	if err != nil {
		g.Log().Line().Error(ctx, "get latest job list error : ", err)
		return
	}

	for _, job := range matchJobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nLocation : %s\nSalary : %s\nMatch Score : %s\nDate : %s\n\n", job.Title, job.Link, job.Location, job.Salary, job.MatchScore, job.UpdateTime.Format("Y-m-d"))
	}

	if replyMessage == "" {
		replyMessage = "No matched job found, please try again later."
	}

	matchJobTotalCount, err := dao.UserMatchedJob.GetUserMatchedJobDetailListTotalCount(ctx, userId)
	if err != nil {
		g.Log().Line().Error(ctx, "get matched job total count error : ", err)
		return
	}

	totalPage := calculateTotalPages(matchJobTotalCount, limit)

	replyMarkup = &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "Current Page " + gconv.String(currentPage+1), CallbackData: CurrentPageData + gconv.String(currentPage)},
			},
			{
				{Text: "Total Page " + gconv.String(totalPage), CallbackData: TotalPageData + gconv.String(totalPage)},
			},
			{
				{Text: "Pre Page", CallbackData: PrePageData},
				{Text: "Next Page", CallbackData: NextPageData},
			},
		},
	}

	return
}

func calculateTotalPages(totalCount, pageSize int) int {
	if totalCount%pageSize == 0 {
		return totalCount / pageSize
	}
	return (totalCount / pageSize) + 1
}
