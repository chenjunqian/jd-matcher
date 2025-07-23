package telegram

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

var ALL_JOBS_CALLBACK_DATA_PREFIX = "all_jobs_callback_data_"
var ALL_JOBS_CURRENT_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "current_page_"
var ALL_JOBS_TOTAL_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "total_page_"
var ALL_JOBS_NEXT_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "next_page"
var ALL_JOBS_PRE_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "pre_page"

func getAllJobsInlineKeyboard(ctx context.Context, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {
	return buildAllJobsInlineKeyboard(ctx, update)
}

func buildAllJobsInlineKeyboard(ctx context.Context, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {

	var currentPage int = 0
	// event from callback button, update inline keyboard
	if update.CallbackQuery != nil {
		updateReplyMarkup := update.CallbackQuery.Message.Message.ReplyMarkup
		for _, inlineKeyboard := range updateReplyMarkup.InlineKeyboard {
			if gstr.HasPrefix(inlineKeyboard[0].CallbackData, MATCHED_JOBS_CURRENT_PAGE_DATA) {
				currentPageStr := gstr.TrimLeftStr(inlineKeyboard[0].CallbackData, MATCHED_JOBS_CURRENT_PAGE_DATA)
				currentPage = gconv.Int(currentPageStr)
				break
			}
		}

		switch update.CallbackQuery.Data {
		case MATCHED_JOBS_PRE_PAGE_DATA:
			if currentPage >= 1 {
				currentPage = currentPage - 1
			}
		case MATCHED_JOBS_NEXT_PAGE_DATA:
			currentPage = currentPage + 1
		}
	}

	limit := 10
	offset := currentPage * limit
	jobList, err := dao.JobDetail.GetLatestJobList(ctx, offset, limit)
	if err != nil {
		g.Log().Line().Error(ctx, "get latest job list error : ", err)
		return
	}

	for _, job := range jobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nLocation : %s\nSalary : %s\nDate : %s\n\n",
			job.Title,
			job.Link,
			job.Location,
			job.Salary,
			job.UpdateTime.Format("Y-m-d"))
	}

	totalJobCount, err := dao.JobDetail.GetTotalJobCount(ctx)
	if err != nil {
		g.Log().Line().Error(ctx, "get total job count error : ", err)
		return
	}

	totalPage := calculateTotalPages(totalJobCount, limit)

	replyMarkup = &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "Current Page " + gconv.String(currentPage+1), CallbackData: ALL_JOBS_CURRENT_PAGE_DATA + gconv.String(currentPage)},
			},
			{
				{Text: "Total Page " + gconv.String(totalPage), CallbackData: ALL_JOBS_TOTAL_PAGE_DATA + gconv.String(totalPage)},
			},
			{
				{Text: "Pre Page", CallbackData: ALL_JOBS_PRE_PAGE_DATA},
				{Text: "Next Page", CallbackData: ALL_JOBS_NEXT_PAGE_DATA},
			},
		},
	}

	return
}
