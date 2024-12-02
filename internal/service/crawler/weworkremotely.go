package crawler

import (
	"context"
	"errors"
	"jd-matcher/utility"

	"github.com/anaskhan96/soup"
	"github.com/gogf/gf/v2/encoding/gjson"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
)

var WEWORKREMOTELY_JOBS_URLS = []string{
	"https://weworkremotely.com/categories/remote-programming-jobs.rss",
	"https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
	"https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
}

func GetAllFullStackJobs(ctx context.Context) (jobList []CommonJob, err error) {

	var errorList []error
	for _, url := range WEWORKREMOTELY_JOBS_URLS {
		resp, err := utility.GetContent(ctx, url)
		if err != nil {
			g.Log().Line().Errorf(ctx, "get weworkremotely jobs from RSS link failed :\n%s\n", err)
			continue
		}
		parsedJobList, err := parseWeworkremotelyRSSResp(ctx, resp)
		if err != nil {
			errorList = append(errorList, err)
			g.Log().Line().Errorf(ctx, "parse weworkremotely jobs from RSS link failed :\n%+v\n", err)
			continue
		}

		jobList = append(jobList, parsedJobList...)
	}

	if len(errorList) > 0 {
		err = errors.Join(errorList...)
	}

	return
}

func parseWeworkremotelyRSSResp(ctx context.Context, resp string) (jobList []CommonJob, err error) {

	rssJSON := gjson.New(resp)
	if rssJSON == nil || rssJSON.IsNil() {
		g.Log().Line().Errorf(ctx, "parse weworkremotely rss failed, the RSS response string is :\n%s", resp)
		return
	}

	var allErrors []error
	if len(rssJSON.GetJsons("rss.channel.item")) > 0 {
		itemJsonArray := rssJSON.GetJsons("rss.channel.item")
		for _, itemJson := range itemJsonArray {
			title := itemJson.Get("title").String()
			region := itemJson.Get("region").String()
			category := itemJson.Get("category").String()
			pubDate := itemJson.Get("pubDate").String()
			link := itemJson.Get("link").String()
			description := itemJson.Get("description").String()
			description = "<div>" + description + "</div>"
			docs := soup.HTMLParse(description)
			if docs.Error != nil {
				allErrors = append(allErrors, docs.Error)
				continue
			}

			descriptionStr := docs.Find("div").FullText()

			commonJob := CommonJob{
				Title:       title,
				Location:    region,
				UpdateTime:  pubDate,
				Url:         link,
				Tags:        gstr.Split(category, " "),
				Description: descriptionStr,
			}
			jobList = append(jobList, commonJob)
		}
	}

	if len(allErrors) > 0 {
		err = errors.Join(allErrors...)
	}

	return
}
