.PHONY: deploy deploy-public deploy-hosting

PROJECT ?= yes-chef-cookbook

deploy: deploy-public

deploy-public deploy-hosting:
	firebase deploy --only hosting --project $(PROJECT)
